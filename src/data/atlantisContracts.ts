/* ──────────────────────────────────────────────────────────
   Atlantis ContractHeader → ADRENAL-N Paket Eşleme Haritası
   
   Bu dosya, packages.ts'deki paket ID'lerini (s_1, wp_1, f2f_1)
   SQL Server'daki ContractHeader/Contract/ContractProduct/Price
   bilgilerine eşler.
   
   Her paket için:
   - contractHeaderId: ContractHeaders.Id
   - contractId: Contracts.Id (TerminalRecords.ContractId)
   - products[]: ContractProducts detayları + fiyatlar
   
   Kaynak: DB sorguları (check17-20 output), db_full_map_output.txt
   ────────────────────────────────────────────────────────── */

import { PRODUCTS, GATE_CONFIG } from '@/types/atlantis';

export interface ContractProductMap {
  contractProductId: number;     // ContractProducts.Id -> Tickets.ProductId
  productId: number;             // Products.Id (1004/1005/1008)
  productName: string;
  prices: {
    ADU?: { contractTicketTypeId: number; priceId: number; price: number };
    CHL?: { contractTicketTypeId: number; priceId: number; price: number };
    COMP?: { contractTicketTypeId: number; priceId: number; price: number };
  };
  // Gate bilgisi: bu product hangi turnstile'a bağlı
  gateId: number | null;
  gateLocation: number | null;
}

export interface ContractMapping {
  packageId: string;             // ADRENAL-N package id (s_1, wp_1, f2f_1)
  contractHeaderId: number;
  contractHeaderName: string;
  contractId: number;            // Contracts.Id
  currencyId: number;            // 1=USD, 2=EUR, 3=TRY
  products: ContractProductMap[];
  isCombo: boolean;              // Birden fazla product varsa combo
  isFree: boolean;               // FREE/COMP kontrat mı
}

// Gate helper: product'a göre gate belirle
function gateFor(productId: number): { gateId: number | null; gateLocation: number | null } {
  switch (productId) {
    case PRODUCTS.WILDPARK_ENTRANCE: return GATE_CONFIG.wildpark;
    case PRODUCTS.CINEMA_ENTRANCE:   return GATE_CONFIG.sinema;
    case PRODUCTS.FACE2FACE_ENTRANCE: return GATE_CONFIG.face2face;
    default: return { gateId: null, gateLocation: null };
  }
}

// Helper: tek ürün kontrat (Münferit / Visitor / Acenta)
function single(
  packageId: string, hId: number, hName: string, cId: number, currId: number,
  cpId: number, prodId: number, prodName: string,
  aduTT: number, aduPrice: number, aduPriceId: number,
  chlTT: number, chlPrice: number, chlPriceId: number,
): ContractMapping {
  return {
    packageId, contractHeaderId: hId, contractHeaderName: hName, contractId: cId, currencyId: currId,
    isCombo: false, isFree: false,
    products: [{
      contractProductId: cpId, productId: prodId, productName: prodName,
      prices: { ADU: { contractTicketTypeId: aduTT, priceId: aduPriceId, price: aduPrice }, CHL: { contractTicketTypeId: chlTT, priceId: chlPriceId, price: chlPrice } },
      ...gateFor(prodId),
    }],
  };
}

// Helper: 2-ürün combo
function combo2(
  packageId: string, hId: number, hName: string, cId: number, currId: number,
  cp1: number, prod1: number, pName1: string, aTT1: number, aP1: number, aPid1: number, cTT1: number, cP1: number, cPid1: number,
  cp2: number, prod2: number, pName2: string, aTT2: number, aP2: number, aPid2: number, cTT2: number, cP2: number, cPid2: number,
): ContractMapping {
  return {
    packageId, contractHeaderId: hId, contractHeaderName: hName, contractId: cId, currencyId: currId,
    isCombo: true, isFree: false,
    products: [
      { contractProductId: cp1, productId: prod1, productName: pName1,
        prices: { ADU: { contractTicketTypeId: aTT1, priceId: aPid1, price: aP1 }, CHL: { contractTicketTypeId: cTT1, priceId: cPid1, price: cP1 } },
        ...gateFor(prod1) },
      { contractProductId: cp2, productId: prod2, productName: pName2,
        prices: { ADU: { contractTicketTypeId: aTT2, priceId: aPid2, price: aP2 }, CHL: { contractTicketTypeId: cTT2, priceId: cPid2, price: cP2 } },
        ...gateFor(prod2) },
    ],
  };
}

// Helper: 3-ürün combo
function combo3(
  packageId: string, hId: number, hName: string, cId: number, currId: number,
  cp1: number, prod1: number, pName1: string, aTT1: number, aP1: number, aPid1: number, cTT1: number, cP1: number, cPid1: number,
  cp2: number, prod2: number, pName2: string, aTT2: number, aP2: number, aPid2: number, cTT2: number, cP2: number, cPid2: number,
  cp3: number, prod3: number, pName3: string, aTT3: number, aP3: number, aPid3: number, cTT3: number, cP3: number, cPid3: number,
): ContractMapping {
  return {
    packageId, contractHeaderId: hId, contractHeaderName: hName, contractId: cId, currencyId: currId,
    isCombo: true, isFree: false,
    products: [
      { contractProductId: cp1, productId: prod1, productName: pName1,
        prices: { ADU: { contractTicketTypeId: aTT1, priceId: aPid1, price: aP1 }, CHL: { contractTicketTypeId: cTT1, priceId: cPid1, price: cP1 } },
        ...gateFor(prod1) },
      { contractProductId: cp2, productId: prod2, productName: pName2,
        prices: { ADU: { contractTicketTypeId: aTT2, priceId: aPid2, price: aP2 }, CHL: { contractTicketTypeId: cTT2, priceId: cPid2, price: cP2 } },
        ...gateFor(prod2) },
      { contractProductId: cp3, productId: prod3, productName: pName3,
        prices: { ADU: { contractTicketTypeId: aTT3, priceId: aPid3, price: aP3 }, CHL: { contractTicketTypeId: cTT3, priceId: cPid3, price: cP3 } },
        ...gateFor(prod3) },
    ],
  };
}

const W = PRODUCTS.WILDPARK_ENTRANCE;   // 1004
const C = PRODUCTS.CINEMA_ENTRANCE;     // 1005
const F = PRODUCTS.FACE2FACE_ENTRANCE;  // 1008

// ════════════════════════════════════════════════════════════
// XD SİNEMA KONTRAT EŞLEMELERİ
// ════════════════════════════════════════════════════════════

const SINEMA_CONTRACTS: ContractMapping[] = [
  // ── Münferit TL ──
  single('s_1',  27, 'CINE M.Y.',       800, 3, 1133, C, 'CINEMA ENTRANCE', 57, 325, 2525, 58, 245, 2526),
  single('s_2',  28, 'CINE M.Y. %15',   801, 3, 1134, C, 'CINEMA ENTRANCE', 59, 276, 2527, 60, 208, 2528),
  single('s_3',  29, 'CINE M.Y. %20',   802, 3, 1135, C, 'CINEMA ENTRANCE', 61, 260, 2529, 62, 196, 2530),
  single('s_4',  30, 'CINE M.Y. %30',   803, 3, 1136, C, 'CINEMA ENTRANCE', 63, 228, 2531, 64, 172, 2532),
  single('s_5',  31, 'CINE M.Y. %40',   804, 3, 1137, C, 'CINEMA ENTRANCE', 65, 195, 2533, 66, 147, 2534),
  single('s_6',  32, 'CINE M.Y. %50',   805, 3, 1138, C, 'CINEMA ENTRANCE', 67, 163, 2535, 68, 123, 2536),
  single('s_7',  33, 'CINE M.KURUM',    806, 3, 1139, C, 'CINEMA ENTRANCE', 69, 228, 2538, 70, 172, 2539),
  single('s_8', 385, 'CINE Family TRY', 807, 3, 1140, C, 'CINEMA ENTRANCE', 1007, 225, 2540, 1008, 160, 2541),
  single('s_9', 335, 'CINE M.Öğrenci/Acenta/Kreş', 936, 3, 1403, C, 'CINEMA ENTRANCE', 904, 145, 3092, 905, 125, 3093),
  single('s_10', 334, 'CINE M.Öğrenci', 935, 3, 1402, C, 'CINEMA ENTRANCE', 902, 160, 3090, 903, 140, 3091),

  // ── Visitor USD ──
  single('s_11', 34, 'CINE VISITOR USD', 693, 1, 911, C, 'CINEMA ENTRANCE', 71, 21, 2080, 72, 16, 2081),
  single('s_12', 35, 'CINE V%25 USD',   694, 1, 912, C, 'CINEMA ENTRANCE', 73, 16, 2082, 74, 12, 2083),
  single('s_13', 405, 'CINE V%35 USD',  812, 1, 1145, C, 'CINEMA ENTRANCE', 1051, 14, 2550, 1052, 11, 2551),
  single('s_14', 36, 'CINE V%OZEL USD', 485, 1, 672, C, 'CINEMA ENTRANCE', 75, 10, 1576, 76, 10, 1577),
  single('s_15', 406, 'CINE V%50 USD',  817, 1, 1150, C, 'CINEMA ENTRANCE', 1053, 11, 2556, 1054, 8, 2561),

  // ── Visitor EUR ──
  single('s_16', 37, 'CINE VISITOR EUR', 695, 2, 913, C, 'CINEMA ENTRANCE', 77, 20, 2084, 78, 15, 2085),
  single('s_17', 39, 'CINE V%25 EUR',   696, 2, 914, C, 'CINEMA ENTRANCE', 81, 15, 2086, 82, 11, 2087),
  single('s_18', 407, 'CINE V%35 EUR',  822, 2, 1155, C, 'CINEMA ENTRANCE', 1055, 13, 2570, 1056, 10, 2571),
  single('s_19', 40, 'CINE V%OZEL EUR', 482, 2, 669, C, 'CINEMA ENTRANCE', 83, 10, 1570, 84, 10, 1571),
  single('s_20', 408, 'CINE V%50 EUR',  827, 2, 1160, C, 'CINEMA ENTRANCE', 1057, 10, 2576, 1058, 8, 2581),

  // ── Çapraz Münferit TL ──
  combo2('s_21', 42, 'CINE C.XD+ WP', 868, 3,
    1222, C, 'CINEMA ENTRANCE',   86, 499, 2705, 87, 379, 2706,
    1221, W, 'WILDPARK ENTRANCE', 86, 1,   2703, 87, 1,   2704),
  combo2('s_22', 43, 'CINE C.XD + F2F', 869, 3,
    1224, C, 'CINEMA ENTRANCE',      88, 449, 2709, 89, 349, 2710,
    1223, F, 'FACE2FACE ENTRANCE',   88, 1,   2707, 89, 1,   2708),
  combo3('s_23', 44, 'CINE C.XD+F2F+WP', 870, 3,
    1226, C, 'CINEMA ENTRANCE',      90, 688, 2713, 91, 508, 2714,
    1225, W, 'WILDPARK ENTRANCE',    90, 1,   2711, 91, 1,   2712,
    1227, F, 'FACE2FACE ENTRANCE',   90, 1,   2715, 91, 1,   2716),
  // MARKET3 TL
  combo3('s_24', 417, 'CINE MARKET 3', 903, 3,
    1327, C, 'CINEMA ENTRANCE',      1075, 533, 2915, 1076, 401, 2916,
    1326, W, 'WILDPARK ENTRANCE',    1075, 1,   2913, 1076, 1,   2914,
    1328, F, 'FACE2FACE ENTRANCE',   1075, 1,   2917, 1076, 1,   2918),

  // ── Çapraz Visitor USD ──
  combo2('s_25', 46, 'CINE C.V.XD+ WP USD', 871, 1,
    1228, C, 'CINEMA ENTRANCE',   94, 34, 2717, 95, 24, 2718,
    1229, W, 'WILDPARK ENTRANCE', 94, 1,  2719, 95, 1,  2720),
  combo2('s_26', 47, 'CINE C.V.XD + F2F USD', 872, 1,
    1230, C, 'CINEMA ENTRANCE',      96, 34, 2721, 97, 24, 2722,
    1231, F, 'FACE2FACE ENTRANCE',   96, 1,  2723, 97, 1,  2724),
  combo3('s_27', 48, 'CINE C.V.XD+F2F+WP USD', 873, 1,
    1232, C, 'CINEMA ENTRANCE',      98, 48, 2725, 99, 38, 2726,
    1233, F, 'FACE2FACE ENTRANCE',   98, 1,  2727, 99, 1,  2728,
    1234, W, 'WILDPARK ENTRANCE',    98, 1,  2729, 99, 1,  2730),
  // MARKET3 VISITOR USD — H418 C906 (priority 10)
  combo3('s_28', 418, 'CINE MARKET 3 VISITOR', 906, 1,
    1338, C, 'CINEMA ENTRANCE',      1077, 28, 2928, 1078, 18, 2939,
    1337, W, 'WILDPARK ENTRANCE',    1077, 1,  2927, 1078, 1,  2938,
    1339, F, 'FACE2FACE ENTRANCE',   1077, 1,  2929, 1078, 1,  2940),

  // ── Çapraz Visitor EUR ──
  combo2('s_29', 49, 'CINE C.XD+ WP EUR', 874, 2,
    1235, C, 'CINEMA ENTRANCE',   100, 32, 2731, 101, 22, 2732,
    1236, W, 'WILDPARK ENTRANCE', 100, 1,  2733, 101, 1,  2734),
  combo2('s_30', 50, 'CINE C.XD + F2F EUR', 875, 2,
    1237, C, 'CINEMA ENTRANCE',      102, 32, 2735, 103, 22, 2736,
    1238, F, 'FACE2FACE ENTRANCE',   102, 1,  2737, 103, 1,  2738),
  combo3('s_31', 51, 'CINE C.V.XD+F2F+WP EUR', 876, 2,
    1239, C, 'CINEMA ENTRANCE',      104, 46, 2739, 105, 36, 2740,
    1240, F, 'FACE2FACE ENTRANCE',   104, 1,  2741, 105, 1,  2742,
    1241, W, 'WILDPARK ENTRANCE',    104, 1,  2743, 105, 1,  2744),
  // MARKET3 VISITOR EUR — H419 C910
  combo3('s_32', 419, 'CINE MARKET 3 VISITOR EUR', 910, 2,
    1351, C, 'CINEMA ENTRANCE',      1079, 27, 2963, 1080, 17, 2964,
    1350, W, 'WILDPARK ENTRANCE',    1079, 1,  2961, 1080, 1,  2962,
    1352, F, 'FACE2FACE ENTRANCE',   1079, 1,  2965, 1080, 1,  2966),

  // ── Acenta USD ──
  single('s_33', 351, 'CINEMA ACENTE -1- USD', 500, 1, 689, C, 'CINEMA ENTRANCE', 936, 12, 1610, 937, 12, 1611),
  single('s_34', 424, 'CINEMA ACENTE -9-USD',  925, 1, 1390, C, 'CINEMA ENTRANCE', 1089, 11, 3041, 1090, 11, 3042),
  single('s_35', 352, 'CINEMA ACENTE -2- USD', 501, 1, 690, C, 'CINEMA ENTRANCE', 938, 10, 1612, 939, 10, 1613),
  single('s_36', 353, 'CINEMA ACENTE -3- USD', 502, 1, 691, C, 'CINEMA ENTRANCE', 940, 9, 1614, 941, 9, 1615),
  single('s_37', 354, 'CINEMA ACENTE -4- USD', 503, 1, 692, C, 'CINEMA ENTRANCE', 942, 8, 1616, 943, 8, 1617),
  single('s_38', 355, 'CINEMA ACENTE -5- USD', 504, 1, 693, C, 'CINEMA ENTRANCE', 944, 7, 1618, 945, 7, 1619),
  single('s_39', 356, 'CINEMA ACENTE -6- USD', 505, 1, 694, C, 'CINEMA ENTRANCE', 946, 6, 1620, 947, 6, 1621),

  // ── Acenta EUR ──
  single('s_40', 358, 'CINEMA ACENTE -1- EUR', 507, 2, 696, C, 'CINEMA ENTRANCE', 950, 12, 1624, 951, 12, 1625),
  single('s_41', 425, 'CINEMA ACENTE -9- EUR', 927, 2, 1392, C, 'CINEMA ENTRANCE', 1091, 11, 3045, 1092, 11, 3046),
  single('s_42', 359, 'CINEMA ACENTE -2- EUR', 508, 2, 697, C, 'CINEMA ENTRANCE', 952, 10, 1626, 953, 10, 1627),
  single('s_43', 361, 'CINEMA ACENTE -3- EUR', 510, 2, 699, C, 'CINEMA ENTRANCE', 956, 9, 1630, 957, 9, 1631),
  single('s_44', 360, 'CINEMA ACENTE -4- EUR', 509, 2, 698, C, 'CINEMA ENTRANCE', 954, 8, 1628, 955, 8, 1629),
  single('s_45', 362, 'CINEMA ACENTE -5- EUR', 511, 2, 700, C, 'CINEMA ENTRANCE', 958, 7, 1632, 959, 7, 1633),
  single('s_46', 363, 'CINEMA ACENTE -6- EUR', 512, 2, 701, C, 'CINEMA ENTRANCE', 960, 6, 1634, 961, 6, 1635),

  // ── CINE FREE ──
  {
    packageId: 's_free', contractHeaderId: 41, contractHeaderName: 'CINE FREE', contractId: 41, currencyId: 3,
    isCombo: false, isFree: true,
    products: [{
      contractProductId: 72, productId: C, productName: 'CINEMA ENTRANCE',
      prices: { COMP: { contractTicketTypeId: 85, priceId: 145, price: 0 } },
      ...gateFor(C),
    }],
  },
];

// ════════════════════════════════════════════════════════════
// WILDPARK KONTRAT EŞLEMELERİ
// ════════════════════════════════════════════════════════════

const WILDPARK_CONTRACTS: ContractMapping[] = [
  // ── Münferit TL ──
  single('wp_1',   3, 'WILD M.Y.',       773, 3, 1106, W, 'WILDPARK ENTRANCE', 8,    405, 2470, 9,    305, 2471),
  single('wp_2',   4, 'WILD M.Y. %15',   774, 3, 1107, W, 'WILDPARK ENTRANCE', 10,   344, 2472, 11,   259, 2473),
  single('wp_3',   5, 'WILD M.Y. %20',   775, 3, 1108, W, 'WILDPARK ENTRANCE', 12,   324, 2474, 13,   244, 2475),
  single('wp_4',   6, 'WILD M.Y. %30',   776, 3, 1109, W, 'WILDPARK ENTRANCE', 14,   284, 2476, 15,   213, 2477),
  single('wp_5',   7, 'WILD M.Y. %40',   777, 3, 1110, W, 'WILDPARK ENTRANCE', 16,   243, 2478, 17,   183, 2479),
  single('wp_6',   8, 'WILD M.Y. %50',   778, 3, 1111, W, 'WILDPARK ENTRANCE', 18,   203, 2480, 19,   153, 2481),
  single('wp_7',   9, 'WILD M.KURUM',    779, 3, 1112, W, 'WILDPARK ENTRANCE', 20,   284, 2483, 21,   213, 2484),
  single('wp_8', 382, 'WILD Family TRY', 780, 3, 1113, W, 'WILDPARK ENTRANCE', 1000, 250, 2485, 1001, 190, 2486),
  single('wp_9', 333, 'WILD M.Öğrenci/Acenta/Kreş', 934, 3, 1401, W, 'WILDPARK ENTRANCE', 900, 150, 3088, 901, 130, 3089),
  single('wp_10', 332, 'WILD M.Öğrenci', 933, 3, 1400, W, 'WILDPARK ENTRANCE', 898, 170, 3086, 899, 145, 3087),

  // ── Visitor USD ──
  single('wp_11', 10, 'WILD VISITOR USD', 686, 1, 904, W, 'WILDPARK ENTRANCE', 22, 22, 2066, 23, 18, 2067),
  single('wp_12', 11, 'WILD V%25 USD',   687, 1, 905, W, 'WILDPARK ENTRANCE', 24, 17, 2068, 25, 14, 2069),
  single('wp_13', 401, 'WILD V%35 USD',  784, 1, 1117, W, 'WILDPARK ENTRANCE', 1043, 14, 2493, 1044, 12, 2494),
  single('wp_14', 12, 'WILD V%OZEL USD',  12, 1, 14, W, 'WILDPARK ENTRANCE', 26, 10, 30, 27, 10, 31),
  single('wp_15', 402, 'WILD V%50 USD',  788, 1, 1121, W, 'WILDPARK ENTRANCE', 1045, 11, 2498, 1046, 9, 2502),

  // ── Visitor EUR ──
  single('wp_16', 13, 'WILD VISITOR EUR', 688, 2, 906, W, 'WILDPARK ENTRANCE', 28, 21, 2070, 29, 17, 2071),
  single('wp_17', 16, 'WILD V%25 EUR',   689, 2, 907, W, 'WILDPARK ENTRANCE', 34, 16, 2072, 35, 13, 2073),
  single('wp_18', 403, 'WILD V%35 EUR',  793, 2, 1126, W, 'WILDPARK ENTRANCE', 1047, 13, 2511, 1048, 11, 2512),
  single('wp_19', 14, 'WILD V%OZEL EUR',  14, 2, 16, W, 'WILDPARK ENTRANCE', 30, 10, 34, 31, 10, 35),
  single('wp_20', 404, 'WILD V%50 EUR',  799, 2, 1132, W, 'WILDPARK ENTRANCE', 1049, 11, 2523, 1050, 9, 2524),

  // ── Çapraz Münferit TL ──
  combo2('wp_21', 18, 'WILD C.WP+ XD', 861, 3,
    1204, W, 'WILDPARK ENTRANCE', 39, 499, 2669, 40, 379, 2670,
    1205, C, 'CINEMA ENTRANCE',   39, 1,   2671, 40, 1,   2672),
  combo2('wp_22', 19, 'WILD C.WP + F2F', 862, 3,
    1206, W, 'WILDPARK ENTRANCE',    41, 509, 2673, 42, 389, 2674,
    1207, F, 'FACE2FACE ENTRANCE',   41, 1,   2675, 42, 1,   2676),
  combo3('wp_23', 20, 'WILD C.WP+F2F+XD', 863, 3,
    1208, W, 'WILDPARK ENTRANCE',    43, 688, 2677, 44, 508, 2678,
    1209, C, 'CINEMA ENTRANCE',      43, 1,   2679, 44, 1,   2680,
    1210, F, 'FACE2FACE ENTRANCE',   43, 1,   2681, 44, 1,   2682),
  // MARKET3 TL
  combo3('wp_24', 414, 'WILD MARKET 3', 932, 3,
    1397, W, 'WILDPARK ENTRANCE',    1069, 533, 3071, 1070, 401, 3072,
    1398, C, 'CINEMA ENTRANCE',      1069, 1,   3073, 1070, 1,   3074,
    1399, F, 'FACE2FACE ENTRANCE',   1069, 1,   3075, 1070, 1,   3076),

  // ── Çapraz Visitor USD ──
  combo2('wp_25', 21, 'WILD C.V.WP+ XD USD', 864, 1,
    1211, W, 'WILDPARK ENTRANCE', 45, 34, 2683, 46, 24, 2684,
    1212, C, 'CINEMA ENTRANCE',   45, 1,  2685, 46, 1,  2686),
  combo2('wp_26', 22, 'WILD C.V.WP + F2F USD', 865, 1,
    1213, W, 'WILDPARK ENTRANCE',    47, 39, 2687, 48, 29, 2688,
    1214, F, 'FACE2FACE ENTRANCE',   47, 1,  2689, 48, 1,  2690),
  combo3('wp_27', 23, 'WILD C.V.WP+F2F+XD USD', 866, 1,
    1215, W, 'WILDPARK ENTRANCE',    49, 48, 2691, 50, 38, 2692,
    1216, C, 'CINEMA ENTRANCE',      49, 1,  2693, 50, 1,  2694,
    1217, F, 'FACE2FACE ENTRANCE',   49, 1,  2695, 50, 1,  2696),
  // MARKET3 VISITOR USD
  combo3('wp_28', 415, 'WILD MARKET 3 VISITOR USD', 894, 1,
    1295, W, 'WILDPARK ENTRANCE',    1071, 28, 2851, 1072, 18, 2852,
    1296, C, 'CINEMA ENTRANCE',      1071, 1,  2853, 1072, 1,  2854,
    1297, F, 'FACE2FACE ENTRANCE',   1071, 1,  2855, 1072, 1,  2856),

  // ── Çapraz Visitor EUR ──
  combo2('wp_29', 24, 'WILD C.WP+ XD EUR', 877, 2,
    1242, W, 'WILDPARK ENTRANCE', 51, 32, 2745, 52, 22, 2746,
    1243, C, 'CINEMA ENTRANCE',   51, 1,  2747, 52, 1,  2748),
  combo2('wp_30', 25, 'WILD C.WP + F2F EUR', 878, 2,
    1244, W, 'WILDPARK ENTRANCE',    53, 37, 2749, 54, 27, 2750,
    1245, F, 'FACE2FACE ENTRANCE',   53, 1,  2751, 54, 1,  2752),
  combo3('wp_31', 26, 'WILD C.V.WP+F2F+XD EUR', 867, 2,
    1218, W, 'WILDPARK ENTRANCE',    55, 46, 2697, 56, 36, 2698,
    1219, C, 'CINEMA ENTRANCE',      55, 1,  2699, 56, 1,  2700,
    1220, F, 'FACE2FACE ENTRANCE',   55, 1,  2701, 56, 1,  2702),
  // MARKET3 VISITOR EUR (DB typo: MAKKET)
  combo3('wp_32', 416, 'WILD MAKKET 3 VISITOR EUR', 898, 2,
    1309, W, 'WILDPARK ENTRANCE',    1073, 27, 2879, 1074, 17, 2880,
    1310, C, 'CINEMA ENTRANCE',      1073, 1,  2881, 1074, 1,  2882,
    1311, F, 'FACE2FACE ENTRANCE',   1073, 1,  2883, 1074, 1,  2884),

  // ── Acenta USD ──
  single('wp_33', 338, 'WILD ACENTE -1- USD', 487, 1, 676, W, 'WILDPARK ENTRANCE', 910, 12, 1584, 911, 12, 1585),
  single('wp_34', 426, 'WILD ACENTE -9- USD', 929, 1, 1394, W, 'WILDPARK ENTRANCE', 1093, 11, 3049, 1094, 11, 3050),
  single('wp_35', 339, 'WILD ACENTE -2- USD', 488, 1, 677, W, 'WILDPARK ENTRANCE', 912, 10, 1586, 913, 10, 1587),
  single('wp_36', 340, 'WILD ACENTE -3- USD', 489, 1, 678, W, 'WILDPARK ENTRANCE', 914, 9, 1588, 915, 9, 1589),
  single('wp_37', 341, 'WILD ACENTE -4- USD', 490, 1, 679, W, 'WILDPARK ENTRANCE', 916, 8, 1590, 917, 8, 1591),
  single('wp_38', 342, 'WILD ACENTE -5- USD', 491, 1, 680, W, 'WILDPARK ENTRANCE', 918, 7, 1592, 919, 7, 1593),
  single('wp_39', 343, 'WILD ACENTE -6- USD', 492, 1, 681, W, 'WILDPARK ENTRANCE', 920, 6, 1594, 921, 6, 1595),

  // ── Acenta EUR ──
  single('wp_40', 345, 'WILD ACENTE -1- EUR', 494, 2, 683, W, 'WILDPARK ENTRANCE', 924, 12, 1598, 925, 12, 1599),
  single('wp_41', 427, 'WILD ACENTE -9- EUR', 931, 2, 1396, W, 'WILDPARK ENTRANCE', 1095, 11, 3053, 1096, 11, 3054),
  single('wp_42', 346, 'WILD ACENTE -2- EUR', 495, 2, 684, W, 'WILDPARK ENTRANCE', 926, 10, 1600, 927, 10, 1601),
  single('wp_43', 348, 'WILD ACENTE -3- EUR', 497, 2, 686, W, 'WILDPARK ENTRANCE', 930, 9, 1604, 931, 9, 1605),
  single('wp_44', 347, 'WILD ACENTE -4- EUR', 496, 2, 685, W, 'WILDPARK ENTRANCE', 928, 8, 1602, 929, 8, 1603),
  single('wp_45', 349, 'WILD ACENTE -5- EUR', 498, 2, 687, W, 'WILDPARK ENTRANCE', 932, 7, 1606, 933, 7, 1607),
  single('wp_46', 350, 'WILD ACENTE -6- EUR', 499, 2, 688, W, 'WILDPARK ENTRANCE', 934, 6, 1608, 935, 6, 1609),

  // ── WILD FREE ──
  {
    packageId: 'wp_free', contractHeaderId: 17, contractHeaderName: 'WILD FREE', contractId: 17, currencyId: 3,
    isCombo: false, isFree: true,
    products: [{
      contractProductId: 20, productId: W, productName: 'WILDPARK ENTRANCE',
      prices: { COMP: { contractTicketTypeId: 38, priceId: 43, price: 0 } },
      ...gateFor(W),
    }],
  },
];

// ════════════════════════════════════════════════════════════
// FACE2FACE KONTRAT EŞLEMELERİ
// ════════════════════════════════════════════════════════════

const FACE2FACE_CONTRACTS: ContractMapping[] = [
  // ── Münferit TL ──
  single('f2f_1',  52, 'FACE M.Y.',       828, 3, 1161, F, 'FACE2FACE ENTRANCE', 106, 340, 2582, 107, 255, 2583),
  single('f2f_2',  54, 'FACE M.Y. %15',   829, 3, 1162, F, 'FACE2FACE ENTRANCE', 110, 289, 2584, 111, 217, 2585),
  single('f2f_3',  55, 'FACE M.Y. %20',   830, 3, 1163, F, 'FACE2FACE ENTRANCE', 112, 272, 2586, 113, 204, 2587),
  single('f2f_4',  56, 'FACE M.Y. %30',   831, 3, 1164, F, 'FACE2FACE ENTRANCE', 114, 238, 2588, 115, 179, 2589),
  single('f2f_5',  57, 'FACE M.Y. %40',   832, 3, 1165, F, 'FACE2FACE ENTRANCE', 114, 204, 2590, 115, 153, 2591),
  single('f2f_6',  58, 'FACE M.Y. %50',   833, 3, 1166, F, 'FACE2FACE ENTRANCE', 118, 170, 2592, 119, 128, 2593),
  single('f2f_7',  59, 'FACE M.KURUM',    834, 3, 1167, F, 'FACE2FACE ENTRANCE', 120, 238, 2595, 121, 179, 2596),
  single('f2f_8', 379, 'FACE Family',     835, 3, 1168, F, 'FACE2FACE ENTRANCE', 993, 245, 2597, 994, 180, 2598),
  single('f2f_9', 337, 'FACE M.Öğrenci/Acenta/Kreş', 938, 3, 1405, F, 'FACE2FACE ENTRANCE', 908, 150, 3096, 909, 130, 3097),
  single('f2f_10', 336, 'FACE M.Öğrenci', 937, 3, 1404, F, 'FACE2FACE ENTRANCE', 906, 170, 3094, 907, 145, 3095),

  // ── Visitor USD ──
  single('f2f_11', 60, 'FACE VISITOR USD', 697, 1, 915, F, 'FACE2FACE ENTRANCE', 122, 23, 2088, 123, 18, 2089),
  single('f2f_12', 61, 'FACE V%25 USD',   698, 1, 916, F, 'FACE2FACE ENTRANCE', 124, 17, 2090, 125, 14, 2091),
  single('f2f_13', 409, 'FACE V%35 USD',  839, 1, 1172, F, 'FACE2FACE ENTRANCE', 1059, 15, 2605, 1060, 12, 2606),
  single('f2f_14', 62, 'FACE V%OZEL USD', 772, 1, 1105, F, 'FACE2FACE ENTRANCE', 126, 10, 2468, 127, 10, 2469),
  single('f2f_15', 410, 'FACE V%50 USD',  843, 1, 1176, F, 'FACE2FACE ENTRANCE', 1061, 12, 2610, 1062, 9, 2614),

  // ── Visitor EUR ──
  single('f2f_16', 63, 'FACE VISITOR EUR', 699, 2, 917, F, 'FACE2FACE ENTRANCE', 128, 22, 2092, 129, 17, 2093),
  single('f2f_17', 64, 'FACE V%25 EUR',   700, 2, 918, F, 'FACE2FACE ENTRANCE', 130, 16, 2094, 131, 13, 2095),
  single('f2f_18', 411, 'FACE V%35 EUR',  848, 2, 1181, F, 'FACE2FACE ENTRANCE', 1063, 14, 2623, 1064, 11, 2624),
  single('f2f_19', 65, 'FACE V%OZEL EUR', 771, 2, 1104, F, 'FACE2FACE ENTRANCE', 132, 10, 2466, 133, 10, 2467),
  single('f2f_20', 412, 'FACE V%50 EUR',  853, 2, 1186, F, 'FACE2FACE ENTRANCE', 1065, 11, 2629, 1066, 9, 2634),

  // ── Çapraz Münferit TL ──
  combo2('f2f_21', 67, 'FACE C.F2F+ XD', 854, 3,
    1187, F, 'FACE2FACE ENTRANCE',   135, 449, 2635, 136, 349, 2636,
    1188, C, 'CINEMA ENTRANCE',       135, 1,   2637, 136, 1,   2638),
  combo2('f2f_22', 68, 'FACE C.F2F + WP', 855, 3,
    1189, F, 'FACE2FACE ENTRANCE',   137, 509, 2639, 138, 389, 2640,
    1190, W, 'WILDPARK ENTRANCE',    137, 1,   2641, 138, 1,   2642),
  combo3('f2f_23', 69, 'FACE C.F2F+WP+XD', 856, 3,
    1191, F, 'FACE2FACE ENTRANCE',   139, 688, 2643, 140, 508, 2644,
    1192, W, 'WILDPARK ENTRANCE',    139, 1,   2645, 140, 1,   2646,
    1193, C, 'CINEMA ENTRANCE',      139, 1,   2647, 140, 1,   2648),
  // MARKET3 TL
  combo3('f2f_24', 413, 'FACE MARKET 3', 885, 3,
    1266, F, 'FACE2FACE ENTRANCE',   1067, 533, 2793, 1068, 401, 2794,
    1264, W, 'WILDPARK ENTRANCE',    1067, 1,   2789, 1068, 1,   2790,
    1265, C, 'CINEMA ENTRANCE',      1067, 1,   2791, 1068, 1,   2792),

  // ── Çapraz Visitor USD ──
  combo2('f2f_25', 70, 'FACE C.V.F2F + XD USD', 857, 1,
    1194, F, 'FACE2FACE ENTRANCE',   141, 34, 2649, 142, 24, 2650,
    1195, C, 'CINEMA ENTRANCE',      141, 1,  2651, 142, 1,  2652),
  combo2('f2f_26', 71, 'FACE C.V.F2F+ WP USD', 858, 1,
    1196, F, 'FACE2FACE ENTRANCE',   143, 39, 2653, 144, 29, 2654,
    1197, W, 'WILDPARK ENTRANCE',    143, 1,  2655, 144, 1,  2656),
  combo3('f2f_27', 72, 'FACE C.V.F2F+WP+XD USD', 859, 1,
    1198, F, 'FACE2FACE ENTRANCE',   145, 48, 2657, 146, 38, 2658,
    1199, W, 'WILDPARK ENTRANCE',    145, 1,  2659, 146, 1,  2660,
    1200, C, 'CINEMA ENTRANCE',      145, 1,  2661, 146, 1,  2662),
  // MARKET3 VISITOR USD
  combo3('f2f_28', 420, 'FACE MARKET 3 VISITOR USD', 914, 1,
    1366, F, 'FACE2FACE ENTRANCE',   1081, 28, 2993, 1082, 18, 2994,
    1364, W, 'WILDPARK ENTRANCE',    1081, 1,  2989, 1082, 1,  2990,
    1365, C, 'CINEMA ENTRANCE',      1081, 1,  2991, 1082, 1,  2992),

  // ── Çapraz Visitor EUR ──
  combo2('f2f_29', 73, 'FACE C.F2F+ XD EUR', 879, 2,
    1246, F, 'FACE2FACE ENTRANCE',   147, 32, 2753, 148, 22, 2754,
    1247, C, 'CINEMA ENTRANCE',      147, 1,  2755, 148, 1,  2756),
  combo2('f2f_30', 74, 'FACE C.F2F+ WP EUR', 880, 2,
    1248, F, 'FACE2FACE ENTRANCE',   149, 37, 2757, 150, 27, 2758,
    1249, W, 'WILDPARK ENTRANCE',    149, 1,  2759, 150, 1,  2760),
  combo3('f2f_31', 75, 'FACE C.V.XD+F2F+WP EUR', 860, 2,
    1201, F, 'FACE2FACE ENTRANCE',   151, 46, 2663, 152, 36, 2664,
    1202, W, 'WILDPARK ENTRANCE',    151, 1,  2665, 152, 1,  2666,
    1203, C, 'CINEMA ENTRANCE',      151, 1,  2667, 152, 1,  2668),
  // MARKET3 VISITOR EUR
  combo3('f2f_32', 421, 'FACE MARKET 3 VISITOR EUR', 919, 2,
    1384, F, 'FACE2FACE ENTRANCE',   1083, 27, 3029, 1084, 17, 3030,
    1382, W, 'WILDPARK ENTRANCE',    1083, 1,  3025, 1084, 1,  3026,
    1383, C, 'CINEMA ENTRANCE',      1083, 1,  3027, 1084, 1,  3028),

  // ── Acenta USD ──
  single('f2f_33', 364, 'FACE ACENTE -1- USD', 513, 1, 702, F, 'FACE2FACE ENTRANCE', 962, 12, 1636, 963, 12, 1637),
  single('f2f_34', 423, 'FACE ACENTE -9- USD', 923, 1, 1388, F, 'FACE2FACE ENTRANCE', 1087, 11, 3037, 1088, 11, 3038),
  single('f2f_35', 365, 'FACE ACENTE -2- USD', 514, 1, 703, F, 'FACE2FACE ENTRANCE', 964, 10, 1638, 965, 10, 1639),
  single('f2f_36', 366, 'FACE ACENTE -3- USD', 515, 1, 704, F, 'FACE2FACE ENTRANCE', 966, 9, 1640, 967, 9, 1641),
  single('f2f_37', 367, 'FACE ACENTE -4- USD', 516, 1, 705, F, 'FACE2FACE ENTRANCE', 968, 8, 1642, 969, 8, 1643),
  single('f2f_38', 368, 'FACE ACENTE -5- USD', 517, 1, 706, F, 'FACE2FACE ENTRANCE', 970, 7, 1644, 971, 7, 1645),
  single('f2f_39', 369, 'FACE ACENTE -6- USD', 518, 1, 707, F, 'FACE2FACE ENTRANCE', 972, 6, 1646, 973, 6, 1647),

  // ── Acenta EUR ──
  single('f2f_40', 371, 'FACE ACENTE -1- EUR', 520, 2, 709, F, 'FACE2FACE ENTRANCE', 976, 12, 1650, 977, 12, 1651),
  single('f2f_41', 422, 'FACE ACENTE -9- EUR', 921, 2, 1386, F, 'FACE2FACE ENTRANCE', 1085, 11, 3033, 1086, 11, 3034),
  single('f2f_42', 372, 'FACE ACENTE -2- EUR', 521, 2, 710, F, 'FACE2FACE ENTRANCE', 978, 10, 1652, 979, 10, 1653),
  single('f2f_43', 374, 'FACE ACENTE -3- EUR', 523, 2, 712, F, 'FACE2FACE ENTRANCE', 982, 9, 1656, 983, 9, 1657),
  single('f2f_44', 373, 'FACE ACENTE -4- EUR', 522, 2, 711, F, 'FACE2FACE ENTRANCE', 980, 8, 1654, 981, 8, 1655),
  single('f2f_45', 375, 'FACE ACENTE -5- EUR', 524, 2, 713, F, 'FACE2FACE ENTRANCE', 984, 7, 1658, 985, 7, 1659),
  single('f2f_46', 376, 'FACE ACENTE -6- EUR', 525, 2, 714, F, 'FACE2FACE ENTRANCE', 986, 6, 1660, 987, 6, 1661),

  // ── FACE Acenta -8- (sadece Face2Face'te var) ──
  single('f2f_47', 377, 'FACE ACENTE -8- USD', 554, 1, 736, F, 'FACE2FACE ENTRANCE', 988, 5, 1704, 989, 5, 1705),
  single('f2f_48', 378, 'FACE ACENTE -8- EUR', 555, 2, 737, F, 'FACE2FACE ENTRANCE', 990, 5, 1706, 991, 5, 1707),

  // ── FACE FREE ──
  {
    packageId: 'f2f_free', contractHeaderId: 66, contractHeaderName: 'FACE FREE', contractId: 66, currencyId: 3,
    isCombo: false, isFree: true,
    products: [{
      contractProductId: 111, productId: F, productName: 'FACE2FACE ENTRANCE',
      prices: { COMP: { contractTicketTypeId: 134, priceId: 222, price: 0 } },
      ...gateFor(F),
    }],
  },
];

// ════════════════════════════════════════════════════════════
// BİRLEŞTİRİLMİŞ HARİTA
// ════════════════════════════════════════════════════════════

export const ALL_CONTRACT_MAPPINGS: ContractMapping[] = [
  ...SINEMA_CONTRACTS,
  ...WILDPARK_CONTRACTS,
  ...FACE2FACE_CONTRACTS,
];

/** packageId -> ContractMapping lookup */
export function getContractMapping(packageId: string): ContractMapping | undefined {
  return ALL_CONTRACT_MAPPINGS.find(m => m.packageId === packageId);
}

/** kasaId -> tüm eşlenmiş kontratlar */
export function getContractsByKasa(kasaId: string): ContractMapping[] {
  const prefix = kasaId === 'sinema' ? 's_' : kasaId === 'wildpark' ? 'wp_' : 'f2f_';
  return ALL_CONTRACT_MAPPINGS.filter(m => m.packageId.startsWith(prefix));
}

/** Eşlemesi olmayan paket ID'lerini bul (henüz tanımlanmamış kontratlar) */
export function getUnmappedPackageIds(kasaId: string, allPackageIds: string[]): string[] {
  const mapped = new Set(ALL_CONTRACT_MAPPINGS.map(m => m.packageId));
  return allPackageIds.filter(id => !mapped.has(id));
}
