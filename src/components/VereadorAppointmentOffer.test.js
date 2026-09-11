import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VereadorAppointmentOffer from './VereadorAppointmentOffer';
import { runTransaction } from 'firebase/firestore';
import { auth } from '../firebase';

jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'citizen' } }, firestore: {} }));
jest.mock('firebase/firestore', () => ({ doc: (_, ...parts) => parts.join('/'), runTransaction: jest.fn() }));

const slot = { date: '2099-12-12', time: '10:00' };
const request = { id: 'request', userId: 'citizen', status: 'Datas Liberadas', aprovadoPor: 'member', dadosSolicitacao: { vereadorId: 'member' }, horariosOferecidos: [slot] };
let tx;
beforeEach(() => {
    auth.currentUser = { uid: 'citizen' };
    tx = { get: jest.fn().mockResolvedValueOnce({ data: () => request }).mockResolvedValueOnce({ data: () => ({}) }), set: jest.fn(), update: jest.fn() };
    runTransaction.mockImplementation((_, callback) => callback(tx));
});
test('reserva somente a opção oferecida e atualiza a solicitação', async () => {
    const onSaved = jest.fn();
    render(<VereadorAppointmentOffer request={request} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /12\/12\/2099/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tx.update).toHaveBeenCalledWith('solicitacoes-vereadores/request', expect.objectContaining({ status: 'Agendado', appointmentDate: slot.date, appointmentTime: slot.time }));
});
test('bloqueia horário reservado por outra solicitação', async () => {
    tx.get.mockReset().mockResolvedValueOnce({ data: () => request }).mockResolvedValueOnce({ data: () => ({ [slot.date]: [slot.time] }) });
    render(<VereadorAppointmentOffer request={request} />);
    fireEvent.click(screen.getByRole('button', { name: /12\/12\/2099/ }));
    await screen.findByText(/já foi reservado/);
    expect(tx.update).not.toHaveBeenCalled();
});
test('relê a aprovação antes de reservar', async () => {
    tx.get.mockReset().mockResolvedValue({ data: () => ({ ...request, status: 'Recusado' }) });
    render(<VereadorAppointmentOffer request={request} />);
    fireEvent.click(screen.getByRole('button', { name: /12\/12\/2099/ }));
    await screen.findByText(/Horário indisponível/);
    expect(tx.update).not.toHaveBeenCalled();
});
test('outro usuário não pode aprovar o motivo', async () => {
    render(<VereadorAppointmentOffer request={request} review />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar motivo/ }));
    await screen.findByText(/Somente o vereador escolhido/);
    expect(tx.update).not.toHaveBeenCalled();
});

test.each(['Recepção', 'Balcão', 'Microempreendedor'])('%s pode reservar a opção aprovada para um visitante', async tipo => {
    auth.currentUser = { uid: 'staff' };
    tx.get.mockReset()
        .mockResolvedValueOnce({ data: () => ({ ...request, userId: 'recepcao' }) })
        .mockResolvedValueOnce({ data: () => ({ tipo }) })
        .mockResolvedValueOnce({ data: () => ({}) })
        .mockResolvedValueOnce({ data: () => ({}) });
    const onSaved = jest.fn();
    render(<VereadorAppointmentOffer request={request} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /12\/12\/2099/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
});
