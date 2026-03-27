import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { v4 as uuidv4 } from 'uuid'; // Precisamos de um ID único para evitar sobrepor arquivos

/**
 * Função utilitária para fazer upload de arquivos para o Firebase Storage
 * @param {File} file O arquivo capturado via input[type="file"]
 * @param {string} folderPath A pasta de destino no Storage (ex: 'balcao-cidadao', 'vereadores/avatares')
 * @returns {Promise<{ url: string, name: string, type: string }>} O objeto com a URL de download gerada e metadados básicos
 */
export const uploadFileToStorage = async (file, folderPath) => {
    if (!file) throw new Error("Nenhum arquivo fornecido para upload.");

    try {
        // Gera um nome de arquivo único para evitar colisões
        const fileExtension = file.name.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;
        
        // Cria a referência (caminho) no buchet do Storage
        const fileRef = ref(storage, `${folderPath}/${uniqueFileName}`);
        
        // Prepara os metadados (opcional, mas bom ter para o navegador renderizar PDFs inline)
        const metadata = {
            contentType: file.type,
        };

        // Realiza o upload binário
        const uploadResult = await uploadBytes(fileRef, file, metadata);
        
        // Pega a URL pública
        const downloadURL = await getDownloadURL(uploadResult.ref);
        
        return {
            url: downloadURL,
            name: file.name,
            type: file.type,
        };
    } catch (error) {
        console.error("Erro no upload do arquivo:", error);
        throw error;
    }
};
