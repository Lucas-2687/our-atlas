import type { Metadata } from 'next';
import AtlasApp from '../atlas-app';

export const metadata: Metadata = {
  title: '编辑共同地图 · 同行地图',
  robots: { index: false, follow: false },
};

export default function Editor() {
  return <AtlasApp editor />;
}
