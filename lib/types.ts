export type Place = { id: string; name: string; kind: 'country' | 'province' | 'city'; country: string; province?: string; continent?: string; markerOnly?: boolean; lat: number | null; lng: number | null };
export type Photo = { key: string; url?: string };
export type Trip = { id: string; title: string; precision: 'day' | 'month' | 'year' | 'unknown'; start: string; end: string; story: string; places: Place[]; photos: Photo[]; createdAt: string };
export type Atlas = { user: {userId:string;displayName:string;email:string} | null; space: {id:string;title:string;names:string[]} | null; trips: Trip[]; demo?: boolean; readonly?: boolean; accessConfigured?:boolean; setupAvailable?:boolean; members?: {displayName:string;slot:number}[] };
export type GeoFeature = {type:'Feature';properties:Record<string,any>;geometry:{type:string;coordinates:any}};
export type GeoCollection = {type:'FeatureCollection';features:GeoFeature[]};
export type Catalog = {countries:Place[];provinces:Place[];cities:Place[]};
