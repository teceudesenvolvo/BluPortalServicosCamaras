import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });
const address = item => item.address || item.endereco || '';
const coordinates = item => { const lat=Number(item.latitude || item.lat || item.location?.latitude || item.location?.lat); const lng=Number(item.longitude || item.lng || item.location?.longitude || item.location?.lng); return Number.isFinite(lat)&&Number.isFinite(lng)?[lat,lng]:null; };

export default function CabinetMap({ visitors, demands }) {
    const [source,setSource]=useState('Demandas'), [points,setPoints]=useState([]);
    const selected=useMemo(()=>source==='Demandas'?demands:visitors,[source,demands,visitors]);
    useEffect(()=>{ let active=true; (async()=>{ const found=[]; for(const item of selected){ let point=coordinates(item); const query=address(item); if(!point&&query){ const key=`cabinet-geocode:${query.toLowerCase()}`; const cached=sessionStorage.getItem(key); if(cached) point=JSON.parse(cached); else try { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'}}); const result=await response.json(); if(result[0]){point=[Number(result[0].lat),Number(result[0].lon)];sessionStorage.setItem(key,JSON.stringify(point));} } catch(_){} } if(point) found.push({...item,point}); } if(active)setPoints(found); })(); return()=>{active=false}; },[selected]);
    const center=points[0]?.point || [-3.439,-39.148];
    return <section className="data-card cabinet-map-card"><div className="cabinet-section-heading"><div><h2>Mapa do gabinete</h2><p>Selecione a origem e clique no pin para abrir os dados.</p></div><select value={source} onChange={e=>setSource(e.target.value)}><option>Demandas</option><option>Visitantes</option></select></div><MapContainer key={`${source}-${center.join('-')}`} center={center} zoom={13} scrollWheelZoom className="cabinet-leaflet-map"><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{points.map(item=><Marker key={item.id} position={item.point}><Popup><strong>{item.name || item.dadosUsuario?.name || item.tipoDemanda || 'Registro'}</strong><p>{address(item)}</p>{item.dadosSolicitacao?.descricao&&<p>{item.dadosSolicitacao.descricao}</p>}<small>{item.status || item.phone || item.email}</small></Popup></Marker>)}</MapContainer><small>{points.length} de {selected.length} registros localizados. Cadastre latitude e longitude para máxima precisão.</small></section>;
}
