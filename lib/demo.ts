import type { Atlas } from './types';
const image = (name:string) => ({key:'',url:`/demo/${name}.svg`});
export const demoAtlas:Atlas = {
  user:null, demo:true, space:{id:'demo',title:'我们的旅行地图',names:['你','我']},
  trips:[
    {id:'demo-japan',title:'把春天留在京都',precision:'month',start:'2025-04',end:'',story:'沿着鸭川慢慢走，把赶路的时间都留给了散步。傍晚坐在河边，等天色一点点变成蓝色。',places:[{id:'INT-JPN-kyoto',name:'京都',kind:'city',country:'JPN',lat:35.0116,lng:135.7681},{id:'INT-JPN-osaka',name:'大阪',kind:'city',country:'JPN',lat:34.6937,lng:135.5023}],photos:[image('kyoto')],createdAt:'2025-04-20T00:00:00Z'},
    {id:'demo-yunnan',title:'在大理，过几天慢日子',precision:'day',start:'2024-10-01',end:'2024-10-05',story:'骑车绕着洱海，遇到一阵风，就停下来。没有排满的日程，只有两个人和一片很蓝的天。',places:[{id:'CN-532900',name:'大理白族自治州',kind:'city',country:'CHN',province:'CN-530000',lat:25.6065,lng:100.2676}],photos:[image('mountains')],createdAt:'2024-10-05T00:00:00Z'},
    {id:'demo-hangzhou',title:'西湖边的周末',precision:'year',start:'2023',end:'',story:'记不清是哪一个周末，记得湖边的晚风和一起吃过的那碗面。先把这个地方留下，照片以后再找。',places:[{id:'CN-330100',name:'杭州市',kind:'city',country:'CHN',province:'CN-330000',lat:30.2741,lng:120.1551}],photos:[image('lake')],createdAt:'2023-06-01T00:00:00Z'}
  ]
};
