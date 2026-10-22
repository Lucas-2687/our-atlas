import {useMemo} from 'react';
import type {GeoCollection,Trip} from '../lib/types';
export default function ShareMapPreview({world,trips}:{world:GeoCollection;trips:Trip[]}){
 const visited=new Set(trips.flatMap(t=>t.places.map(p=>p.country)));
 const paths=useMemo(()=>world.features.map(f=>{const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return {id:f.properties.id,name:f.properties.name,path:polygons.flatMap((poly:any)=>poly.map((ring:number[][])=>ring.map(([lng,lat],i)=>`${i?'L':'M'}${((lng+180)*2).toFixed(1)},${((90-lat)*2).toFixed(1)}`).join('')+'Z')).join('')};}),[world]);
 return <svg viewBox="0 0 720 360" aria-label="共同足迹图片预览地图" role="img">{paths.map(f=><path key={f.id} d={f.path} fill={visited.has(f.id)?'#458f83':'#f0f2e7'} stroke="#afc2b5" strokeWidth=".45" fillRule="evenodd"><title>{f.name}</title></path>)}</svg>;
}
