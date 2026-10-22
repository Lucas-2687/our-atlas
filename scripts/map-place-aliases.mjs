export const provinceNames = {
  "11": "北京市", "12": "天津市", "13": "河北省", "14": "山西省", "15": "内蒙古自治区",
  "21": "辽宁省", "22": "吉林省", "23": "黑龙江省", "31": "上海市", "32": "江苏省",
  "33": "浙江省", "34": "安徽省", "35": "福建省", "36": "江西省", "37": "山东省",
  "41": "河南省", "42": "湖北省", "43": "湖南省", "44": "广东省", "45": "广西壮族自治区",
  "46": "海南省", "50": "重庆市", "51": "四川省", "52": "贵州省", "53": "云南省",
  "54": "西藏自治区", "61": "陕西省", "62": "甘肃省", "63": "青海省", "64": "宁夏回族自治区",
  "65": "新疆维吾尔自治区", "71": "台湾省", "81": "香港特别行政区", "82": "澳门特别行政区",
};

export const provinceEnglish = {
  "Beijing Municipality": "11", "Tianjin Municipality": "12", "Hebei Province": "13",
  "Shanxi Province": "14", "Inner Mongolia Autonomous Region": "15", "Liaoning Province": "21",
  "Jilin Province": "22", "Heilongjiang Province": "23", "Shanghai Municipality": "31",
  "Jiangsu Province": "32", "Zhejiang Province": "33", "Anhui Province": "34", "Fujian Province": "35",
  "Jiangxi Province": "36", "Shandong Province": "37", "Henan Province": "41", "Hubei Province": "42",
  "Hunan Province": "43", "Guangdong Province": "44", "Guangxi Zhuang Autonomous Region": "45",
  "Hainan Province": "46", "Chongqing Municipality": "50", "Sichuan Province": "51",
  "Guizhou Province": "52", "Yunnan Province": "53", "Tibet Autonomous Region": "54",
  "Shaanxi Province": "61", "Gansu province": "62", "Qinghai Province": "63",
  "Ningxia Hui Autonomous Region": "64", "Xinjiang Uygur Autonomous Region": "65",
  "Taiwan Province": "71", "Hong Kong Special Administrative Region": "81", "Macao Special Administrative Region": "82",
};

export const municipalities = new Set(["11", "12", "31", "50", "81", "82"]);

// Transliterations and the absorbed Laiwu prefecture need explicit, reviewable matches.
export const prefectureAliases = {
  "Alxa League": "152900", "Bayannur": "150800", "Hinggan League": "152200",
  "Hohhot": "150100", "Hulunbuir": "150700", "Ordos": "150600", "Ulanqab": "150900",
  "Xilingol League": "152500", "Chaoyang": "211300", "Laiwu": "370100",
  "Harbin": "230100", "Qiqihar": "230200", "Kashi Prefecture": "653100",
  "Garzê Tibetan Autonomous Prefecture": "513300", "Ngawa Tibetan and Qiang Autonomous Prefecture": "513200",
  "Dêqên Tibetan Autonomous Prefecture": "533400", "Lhasa": "540100", "Lhoka": "540500",
  "Nagqu Prefecture": "540600", "Ngari Prefecture": "542500", "Nyingchi": "540400",
  "Qamdo": "540300", "Xigazê": "540200", "Golog Tibetan Autonomous Prefecture": "632600",
  "Ürümqi": "650100", "Aksu Prefecture": "652900", "Altay Prefecture": "654300",
  "Bayingolin Mongolia Autonomous Prefecture": "652800", "Bortala Mongol Autonomous Prefecture": "652700",
  "Hotan Prefecture": "653200", "Ili Kazak Autonomous Prefecture": "654000", "Karamay": "650200",
  "Kizilsu Kirgiz Autonomous Prefecture": "653000", "Tarbaĝatay Prefecture": "654200", "Turpan": "650400",
};

// Approximate settlement markers, not fabricated administrative polygons.
// Public geographical facts; links identify the settlements independently of map vendors.
export const settlementMarkers = {
  "659002": { lng: 81.28, lat: 40.55, source: "https://en.wikipedia.org/wiki/Aral,_Xinjiang" },
  "659003": { lng: 79.08, lat: 39.87, source: "https://en.wikipedia.org/wiki/Tumxuk" },
  "659004": { lng: 87.53, lat: 44.17, source: "https://en.wikipedia.org/wiki/Wujiaqu" },
  "659005": { lng: 87.82, lat: 47.36, source: "https://en.wikipedia.org/wiki/Beitun,_Xinjiang" },
  "659006": { lng: 85.67, lat: 41.87, source: "https://en.wikipedia.org/wiki/Tiemenguan" },
  "659007": { lng: 82.35, lat: 44.84, source: "https://en.wikipedia.org/wiki/Shuanghe" },
  "659008": { lng: 81.05, lat: 43.94, source: "https://en.wikipedia.org/wiki/Kokdala" },
  "659009": { lng: 79.29, lat: 37.21, source: "https://en.wikipedia.org/wiki/Kunyu" },
  "659010": { lng: 84.83, lat: 44.69, source: "https://en.wikipedia.org/wiki/Huyanghe" },
  "659011": { lng: 93.75, lat: 42.80, source: "https://en.wikipedia.org/wiki/Xinxing,_Xinjiang" },
  "659012": { lng: 82.55, lat: 46.71, source: "https://en.wikipedia.org/wiki/Baiyang,_Xinjiang" },
};
