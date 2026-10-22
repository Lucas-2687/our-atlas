'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isMapRegion } from '../lib/map-region-level';
import { layoutCityLabels } from '../lib/city-label-layout';
import type { Catalog, GeoCollection, Place, Trip } from '../lib/types';
const regions:Record<string,{center:[number,number];zoom:number}>={'全球':{center:[23,15],zoom:2},'Asia':{center:[31,109],zoom:3},'Europe':{center:[50,17],zoom:4},'Africa':{center:[3,20],zoom:3},'North America':{center:[35,-100],zoom:3},'South America':{center:[-20,-62],zoom:3},'Oceania':{center:[-24,137],zoom:3},'Antarctica':{center:[-68,0],zoom:2}};
declare global { interface Window { L:any } }
function textNode(text:string){const node=document.createElement('span');node.textContent=text;return node;}
export default function AtlasMap({world,catalog,trips,continent,selected,onSelect,filter}:{world:GeoCollection;catalog:Catalog;trips:Trip[];continent:string;selected:Place|null;onSelect:(p:Place)=>void;filter:string}){
 const target=useRef<HTMLDivElement>(null),map=useRef<any>(null),layers=useRef<any[]>([]),click=useRef(onSelect);click.current=onSelect;
 const [ready,setReady]=useState(false),[china,setChina]=useState<GeoCollection|null>(null),[province,setProvince]=useState<GeoCollection|null>(null),[mapError,setMapError]=useState('');
 const currentProvince=selected?.kind==='province'?selected.id:selected?.province;
 const markerOnlyCities=useMemo(()=>new Set(catalog.cities.filter(place=>place.markerOnly).map(place=>place.id)),[catalog]);
 useEffect(()=>{let alive=true;const init=()=>{if(!alive||!target.current||map.current)return;const L=window.L;map.current=L.map(target.current,{zoomControl:false,attributionControl:false,minZoom:1.5,maxZoom:11,zoomSnap:.25,worldCopyJump:false}).setView([31,109],3);L.control.zoom({position:'bottomright'}).addTo(map.current);setReady(true);};if(window.L)init();else{let script=document.querySelector<HTMLScriptElement>('#atlas-leaflet');if(!script){script=document.createElement('script');script.id='atlas-leaflet';script.src='/vendor/leaflet.js';document.head.appendChild(script);}script.addEventListener('load',init);script.addEventListener('error',()=>setMapError('地图没有加载成功，请刷新重试'));}const obs=new ResizeObserver(()=>map.current?.invalidateSize());if(target.current)obs.observe(target.current);return ()=>{alive=false;obs.disconnect();map.current?.remove();map.current=null;};},[]);
 useEffect(()=>{fetch('/data/china.json').then(r=>r.json() as Promise<GeoCollection>).then(setChina).catch(()=>setMapError('中国地图加载失败，请刷新重试'));},[]);
 useEffect(()=>{setProvince(null);if(!currentProvince)return;const code=currentProvince.replace('CN-','');if(['110000','120000','310000','500000','810000','820000'].includes(code))return;const ctrl=new AbortController();fetch(`/data/provinces/${code}.json`,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<GeoCollection>;}).then(setProvince).catch(e=>{if(e.name!=='AbortError')setMapError('城市边界暂未加载，可从右侧列表选择城市');});return()=>ctrl.abort();},[currentProvince]);
 useEffect(()=>{if(!ready)return;const config=regions[continent]||regions.Asia;map.current.setView(config.center,config.zoom-(map.current.getSize().x<600?.5:0),{animate:false});},[continent,ready]);
 useEffect(()=>{if(!ready||!selected||selected.lat===null||selected.lng===null)return;const zoom=selected.kind==='city'?7:selected.kind==='province'?5.5:selected.country==='CHN'?4:selected.country==='RUS'||selected.country==='USA'||selected.country==='CAN'?3:4.75;map.current.setView([selected.lat,selected.lng],zoom-(map.current.getSize().x<600?.75:0),{animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});},[selected,ready]);
 useEffect(()=>{if(!ready)return;const L=window.L,m=map.current;layers.current.forEach(l=>m.removeLayer(l));layers.current=[];const add=(l:any)=>{l.addTo(m);layers.current.push(l);};
  const places=trips.flatMap(t=>t.places),countrySet=new Set(places.map(p=>p.country)),provinceSet=new Set(places.flatMap(p=>p.kind==='province'?[p.id]:p.province?[p.province]:[])),citySet=new Set(places.filter(p=>p.kind==='city').map(p=>p.id));
  const isShown=(visited:boolean)=>filter==='all'||filter==='visited'&&visited||filter==='unvisited'&&!visited;
  for(let lat=-60;lat<=80;lat+=20)add(L.polyline([[-180,lat].reverse(),[180,lat].reverse()],{color:'#b7cdd0',weight:.7,opacity:.42,interactive:false,dashArray:'2 6'}));
  for(let lng=-180;lng<=180;lng+=20)add(L.polyline([[-75,lng],[85,lng]],{color:'#b7cdd0',weight:.7,opacity:.42,interactive:false,dashArray:'2 6'}));
  const countryLayer=L.geoJSON(world,{style:(f:any)=>{const p=f.properties,visited=countrySet.has(p.id);return {fillColor:visited?'#458f83':'#eef0e7',color:p.id===selected?.country?'#275d54':'#a8b7b1',weight:p.id===selected?.country?1.8:.65,fillOpacity:isShown(visited) ? .94 : .18,opacity:.85};},onEachFeature:(f:any,l:any)=>{const p=catalog.countries.find(c=>c.id===f.properties.id);if(p){l.bindTooltip(textNode(`${p.name}${countrySet.has(p.id)?' · 去过':''}`),{sticky:true,className:'atlas-tooltip'});l.on('click',()=>click.current(p));}}});add(countryLayer);
  if(selected?.country==='CHN'&&china){add(L.geoJSON(china,{style:(f:any)=>({fillColor:provinceSet.has(f.properties.id)?'#458f83':'#eef0e7',fillOpacity:isShown(provinceSet.has(f.properties.id)) ? .96 : .15,color:f.properties.id===currentProvince?'#215c51':'#9cad9f',weight:f.properties.id===currentProvince?2:.7}),onEachFeature:(f:any,l:any)=>{l.bindTooltip(textNode(f.properties.name),{sticky:true,className:'atlas-tooltip'});l.on('click',()=>click.current(f.properties));}}));}
  if(province){add(L.geoJSON(province,{filter:(f:any)=>isMapRegion(f.properties),style:(f:any)=>({fillColor:citySet.has(f.properties.id)?'#72ae95':'#eef0e7',fillOpacity:isShown(citySet.has(f.properties.id)) ? .92 : .15,color:f.properties.id===selected?.id?'#174b41':'#a2b3a3',weight:f.properties.id===selected?.id?2:.8}),onEachFeature:(f:any,l:any)=>{l.bindTooltip(textNode(f.properties.name),{sticky:true,className:'atlas-tooltip'});l.on('click',()=>click.current(f.properties));}}));}
  const labeled=currentProvince?[]:selected?.country==='CHN'&&china?china.features.map(f=>f.properties):!selected||selected.kind==='country'?world.features.filter(f=>f.properties.rank<=(m.getZoom()>4?4:2)||countrySet.has(f.properties.id)).map(f=>f.properties):[];
  labeled.forEach(p=>{if(p.lat==null)return;const short=p.name.replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|白族自治州|彝族自治州|藏族自治州|省|市)$/,'');const node=textNode(short==='大韩民国'?'韩国':short==='朝鲜民主主义人民共和国'?'朝鲜':short);node.className='country-label';add(L.marker([p.lat,p.lng],{interactive:false,keyboard:false,icon:L.divIcon({className:'country-label-wrap',html:node,iconSize:[110,20],iconAnchor:[55,currentProvince?24:10]})}));});
  const candidates=currentProvince?catalog.cities.filter(p=>p.province===currentProvince):selected?.country&&selected.country!=='CHN'?catalog.cities.filter(p=>p.country===selected.country).slice(0,180):[];
  const points=new Map([...candidates,...places.filter(p=>p.kind==='city'),...(selected?.kind==='city'?[selected]:[])].map(p=>[p.id,p]));
  for(const p of points.values()){if(!isMapRegion(p)&&!markerOnlyCities.has(p.id))continue;const visited=citySet.has(p.id);if(p.country==='CHN'&&!visited&&p.id!==selected?.id)continue;if(p.lat===null||p.lng===null||!isShown(visited))continue;const marker=L.circleMarker([p.lat,p.lng],{radius:p.id===selected?.id?8:visited?6:3.5,color:visited?'#fff':'#839c99',weight:visited?2:1,fillColor:visited?'#22665a':'#e9f0ed',fillOpacity:1});marker.bindTooltip(textNode(`${p.name}${visited?' · 一起去过':''}`),{direction:'top',className:'atlas-tooltip'});marker.on('click',()=>click.current(p));add(marker);}

  let labelGroup:any=null,frame=0;
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(context)context.font='500 12px "Microsoft YaHei", "PingFang SC", sans-serif';
  const renderCityLabels=()=>{
   if(labelGroup)m.removeLayer(labelGroup);
   labelGroup=null;
   if(!province||!currentProvince)return;
   const size=m.getSize();
   const labels=layoutCityLabels({features:province.features.filter(f=>isMapRegion(f.properties)&&isShown(citySet.has(f.properties.id))),land:china?.features||province.features,project:coordinate=>m.latLngToContainerPoint([coordinate[1],coordinate[0]]),measure:name=>context?.measureText(name).width??name.length*12,size,selectedId:selected?.id,visited:citySet});
   labelGroup=L.layerGroup().addTo(m);
   for(const label of labels){
    if(label.leader)L.polyline(label.leader.map(p=>m.containerPointToLatLng([p.x,p.y])),{color:'#537c70',weight:1,opacity:.8,interactive:false}).addTo(labelGroup);
    const node=textNode(label.name);node.className='city-label'+(label.leader?' city-label-external':'');
    L.marker(m.containerPointToLatLng([label.center.x,label.center.y]),{interactive:false,keyboard:false,icon:L.divIcon({className:'city-label-wrap',html:node,iconSize:[label.width,label.height],iconAnchor:[label.width/2,label.height/2]})}).addTo(labelGroup);
   }
  };
  const scheduleLabels=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(renderCityLabels);};
  m.on('zoomend moveend resize',scheduleLabels);renderCityLabels();
  return()=>{cancelAnimationFrame(frame);m.off('zoomend moveend resize',scheduleLabels);if(labelGroup)m.removeLayer(labelGroup);};
 },[ready,world,catalog,trips,selected,filter,china,province,currentProvince,markerOnlyCities]);
 return <div className="map-surface"><div ref={target} className="leaflet-host" aria-label="共同旅行足迹地图"/>{!ready&&<div className="map-loading">正在展开地图…</div>}{(mapError||(selected&&markerOnlyCities.has(selected.id)))&&<div className="map-notice">{mapError||'此行政区显示城市标记，当前数据不含已核实的边界。'}</div>}<div className="map-note"><span>共同足迹地图</span><a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a><span>/</span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">HDX · geoBoundaries</a><span>·</span><a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noreferrer">CC BY 3.0 IGO</a><span>/</span><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">4.0</a></div></div>;
}
