import AtlasApp from '../../atlas-app';
export const dynamic = 'force-dynamic';
export default async function Shared({params}:{params:Promise<{token:string}>}){const {token}=await params;return <AtlasApp shareToken={token}/>;}
