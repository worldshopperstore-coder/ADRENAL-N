export interface PackageItem {
  id: string;
  kasaId: 'wildpark' | 'sinema' | 'face2face';
  name: string;
  category: 'Münferit' | 'Visitor' | 'Çapraz Münferit' | 'Çapraz Visitor' | 'Acenta';
  adultPrice: number;
  childPrice: number;
  currency: 'TL' | 'USD' | 'EUR';
  pruvaAdultShare?: number;
  pruvaChildShare?: number;
}

export const INITIAL_PACKAGES: PackageItem[] = [
  // ─── XD SİNEMA ───────────────────────────────────────────────────────────────
  // Münferit - TL
  { id: 's_1',  kasaId: 'sinema', name: 'M.Y',                 category: 'Münferit', adultPrice: 325, childPrice: 245, currency: 'TL' },
  { id: 's_2',  kasaId: 'sinema', name: 'M.Y%15',              category: 'Münferit', adultPrice: 276, childPrice: 208, currency: 'TL' },
  { id: 's_3',  kasaId: 'sinema', name: 'M.Y%20',              category: 'Münferit', adultPrice: 260, childPrice: 196, currency: 'TL' },
  { id: 's_4',  kasaId: 'sinema', name: 'M.Y%30',              category: 'Münferit', adultPrice: 228, childPrice: 172, currency: 'TL' },
  { id: 's_5',  kasaId: 'sinema', name: 'M.Y%40',              category: 'Münferit', adultPrice: 195, childPrice: 147, currency: 'TL' },
  { id: 's_6',  kasaId: 'sinema', name: 'M.Y%50',              category: 'Münferit', adultPrice: 163, childPrice: 123, currency: 'TL' },
  { id: 's_7',  kasaId: 'sinema', name: 'M.Kurum',             category: 'Münferit', adultPrice: 228, childPrice: 172, currency: 'TL' },
  { id: 's_8',  kasaId: 'sinema', name: 'Family',              category: 'Münferit', adultPrice: 225, childPrice: 160, currency: 'TL' },
  { id: 's_9',  kasaId: 'sinema', name: 'Öğrenci',             category: 'Münferit', adultPrice: 145, childPrice: 125, currency: 'TL' },
  { id: 's_10', kasaId: 'sinema', name: 'Öğrenci/Acenta/Kreş', category: 'Münferit', adultPrice: 125, childPrice: 110, currency: 'TL' },
  // Visitor - USD
  { id: 's_11', kasaId: 'sinema', name: 'Visitor', category: 'Visitor', adultPrice: 21, childPrice: 16, currency: 'USD' },
  { id: 's_12', kasaId: 'sinema', name: 'V%25',    category: 'Visitor', adultPrice: 16, childPrice: 12, currency: 'USD' },
  { id: 's_13', kasaId: 'sinema', name: 'V%35',    category: 'Visitor', adultPrice: 14, childPrice: 11, currency: 'USD' },
  { id: 's_14', kasaId: 'sinema', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 's_15', kasaId: 'sinema', name: 'V%50',    category: 'Visitor', adultPrice: 11, childPrice:  8, currency: 'USD' },
  // Visitor - EUR
  { id: 's_16', kasaId: 'sinema', name: 'Visitor', category: 'Visitor', adultPrice: 20, childPrice: 15, currency: 'EUR' },
  { id: 's_17', kasaId: 'sinema', name: 'V%25',    category: 'Visitor', adultPrice: 15, childPrice: 11, currency: 'EUR' },
  { id: 's_18', kasaId: 'sinema', name: 'V%35',    category: 'Visitor', adultPrice: 13, childPrice: 10, currency: 'EUR' },
  { id: 's_19', kasaId: 'sinema', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 's_20', kasaId: 'sinema', name: 'V%50',    category: 'Visitor', adultPrice: 10, childPrice:  8, currency: 'EUR' },
  // Çapraz Münferit - TL
  { id: 's_21', kasaId: 'sinema', name: 'Ç.XD+ WP',      category: 'Çapraz Münferit', adultPrice: 500, childPrice: 380, currency: 'TL' },
  { id: 's_22', kasaId: 'sinema', name: 'Ç.XD + F2F',     category: 'Çapraz Münferit', adultPrice: 450, childPrice: 350, currency: 'TL' },
  { id: 's_23', kasaId: 'sinema', name: 'Ç.XD+F2F+WP',    category: 'Çapraz Münferit', adultPrice: 690, childPrice: 510, currency: 'TL' },
  { id: 's_24', kasaId: 'sinema', name: 'MARKET3',         category: 'Çapraz Münferit', adultPrice: 536, childPrice: 404, currency: 'TL' },
  // Çapraz Visitor - USD
  { id: 's_25', kasaId: 'sinema', name: 'Ç.V.XD+ WP',     category: 'Çapraz Visitor', adultPrice: 35, childPrice: 25, currency: 'USD' },
  { id: 's_26', kasaId: 'sinema', name: 'Ç.V.XD+ F2F',    category: 'Çapraz Visitor', adultPrice: 35, childPrice: 25, currency: 'USD' },
  { id: 's_27', kasaId: 'sinema', name: 'Ç.V.XD+F2F+WP',  category: 'Çapraz Visitor', adultPrice: 50, childPrice: 40, currency: 'USD' },
  { id: 's_28', kasaId: 'sinema', name: 'MARKET3 VISITOR', category: 'Çapraz Visitor', adultPrice: 30, childPrice: 20, currency: 'USD' },
  // Çapraz Visitor - EUR
  { id: 's_29', kasaId: 'sinema', name: 'Ç.V.XD+ WP',     category: 'Çapraz Visitor', adultPrice: 33, childPrice: 23, currency: 'EUR' },
  { id: 's_30', kasaId: 'sinema', name: 'Ç.V.XD + F2F',   category: 'Çapraz Visitor', adultPrice: 33, childPrice: 23, currency: 'EUR' },
  { id: 's_31', kasaId: 'sinema', name: 'Ç.V.XD+F2F+WP',  category: 'Çapraz Visitor', adultPrice: 48, childPrice: 38, currency: 'EUR' },
  { id: 's_32', kasaId: 'sinema', name: 'MARKET3 VISITOR', category: 'Çapraz Visitor', adultPrice: 29, childPrice: 19, currency: 'EUR' },
  // Acenta - USD
  { id: 's_33', kasaId: 'sinema', name: 'Acenta $12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'USD' },
  { id: 's_34', kasaId: 'sinema', name: 'Acenta $11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'USD' },
  { id: 's_35', kasaId: 'sinema', name: 'Acenta $10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 's_36', kasaId: 'sinema', name: 'Acenta $9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'USD' },
  { id: 's_37', kasaId: 'sinema', name: 'Acenta $8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'USD' },
  { id: 's_38', kasaId: 'sinema', name: 'Acenta $7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'USD' },
  { id: 's_39', kasaId: 'sinema', name: 'Acenta $6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'USD' },
  // Acenta - EUR
  { id: 's_40', kasaId: 'sinema', name: 'Acenta €12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'EUR' },
  { id: 's_41', kasaId: 'sinema', name: 'Acenta €11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'EUR' },
  { id: 's_42', kasaId: 'sinema', name: 'Acenta €10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 's_43', kasaId: 'sinema', name: 'Acenta €9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'EUR' },
  { id: 's_44', kasaId: 'sinema', name: 'Acenta €8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'EUR' },
  { id: 's_45', kasaId: 'sinema', name: 'Acenta €7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'EUR' },
  { id: 's_46', kasaId: 'sinema', name: 'Acenta €6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'EUR' },

  // ─── WİLDPARK ────────────────────────────────────────────────────────────────
  // Münferit - TL
  { id: 'wp_1',  kasaId: 'wildpark', name: 'M.Y',                 category: 'Münferit', adultPrice: 405, childPrice: 305, currency: 'TL' },
  { id: 'wp_2',  kasaId: 'wildpark', name: 'M.Y%15',              category: 'Münferit', adultPrice: 344, childPrice: 259, currency: 'TL' },
  { id: 'wp_3',  kasaId: 'wildpark', name: 'M.Y%20',              category: 'Münferit', adultPrice: 324, childPrice: 244, currency: 'TL' },
  { id: 'wp_4',  kasaId: 'wildpark', name: 'M.Y%30',              category: 'Münferit', adultPrice: 284, childPrice: 213, currency: 'TL' },
  { id: 'wp_5',  kasaId: 'wildpark', name: 'M.Y%40',              category: 'Münferit', adultPrice: 243, childPrice: 183, currency: 'TL' },
  { id: 'wp_6',  kasaId: 'wildpark', name: 'M.Y%50',              category: 'Münferit', adultPrice: 203, childPrice: 153, currency: 'TL' },
  { id: 'wp_7',  kasaId: 'wildpark', name: 'M.Kurum',             category: 'Münferit', adultPrice: 284, childPrice: 213, currency: 'TL' },
  { id: 'wp_8',  kasaId: 'wildpark', name: 'Family',              category: 'Münferit', adultPrice: 250, childPrice: 190, currency: 'TL' },
  { id: 'wp_9',  kasaId: 'wildpark', name: 'Öğrenci',             category: 'Münferit', adultPrice: 150, childPrice: 130, currency: 'TL' },
  { id: 'wp_10', kasaId: 'wildpark', name: 'Öğrenci/Acenta/Kreş', category: 'Münferit', adultPrice: 130, childPrice: 115, currency: 'TL' },
  // Visitor - USD
  { id: 'wp_11', kasaId: 'wildpark', name: 'Visitor', category: 'Visitor', adultPrice: 22, childPrice: 18, currency: 'USD' },
  { id: 'wp_12', kasaId: 'wildpark', name: 'V%25',    category: 'Visitor', adultPrice: 17, childPrice: 14, currency: 'USD' },
  { id: 'wp_13', kasaId: 'wildpark', name: 'V%35',    category: 'Visitor', adultPrice: 14, childPrice: 12, currency: 'USD' },
  { id: 'wp_14', kasaId: 'wildpark', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 'wp_15', kasaId: 'wildpark', name: 'V%50',    category: 'Visitor', adultPrice: 11, childPrice:  9, currency: 'USD' },
  // Visitor - EUR
  { id: 'wp_16', kasaId: 'wildpark', name: 'Visitor', category: 'Visitor', adultPrice: 21, childPrice: 17, currency: 'EUR' },
  { id: 'wp_17', kasaId: 'wildpark', name: 'V%25',    category: 'Visitor', adultPrice: 16, childPrice: 13, currency: 'EUR' },
  { id: 'wp_18', kasaId: 'wildpark', name: 'V%35',    category: 'Visitor', adultPrice: 13, childPrice: 11, currency: 'EUR' },
  { id: 'wp_19', kasaId: 'wildpark', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 'wp_20', kasaId: 'wildpark', name: 'V%50',    category: 'Visitor', adultPrice: 11, childPrice:  9, currency: 'EUR' },
  // Çapraz Münferit - TL
  { id: 'wp_21', kasaId: 'wildpark', name: 'Ç.WP+ XD',       category: 'Çapraz Münferit', adultPrice: 500, childPrice: 380, currency: 'TL' },
  { id: 'wp_22', kasaId: 'wildpark', name: 'Ç.WP + F2F',      category: 'Çapraz Münferit', adultPrice: 510, childPrice: 390, currency: 'TL' },
  { id: 'wp_23', kasaId: 'wildpark', name: 'Ç.WP+F2F+XD',     category: 'Çapraz Münferit', adultPrice: 690, childPrice: 510, currency: 'TL' },
  { id: 'wp_24', kasaId: 'wildpark', name: 'MARKET3',          category: 'Çapraz Münferit', adultPrice: 536, childPrice: 404, currency: 'TL' },
  // Çapraz Visitor - USD
  { id: 'wp_25', kasaId: 'wildpark', name: 'Ç.V.WP+ XD',      category: 'Çapraz Visitor', adultPrice: 35, childPrice: 25, currency: 'USD' },
  { id: 'wp_26', kasaId: 'wildpark', name: 'Ç.V.WP + F2F',    category: 'Çapraz Visitor', adultPrice: 40, childPrice: 30, currency: 'USD' },
  { id: 'wp_27', kasaId: 'wildpark', name: 'Ç.V.WP+F2F+XD',   category: 'Çapraz Visitor', adultPrice: 50, childPrice: 40, currency: 'USD' },
  { id: 'wp_28', kasaId: 'wildpark', name: 'MARKET3 VISITOR',  category: 'Çapraz Visitor', adultPrice: 30, childPrice: 20, currency: 'USD' },
  // Çapraz Visitor - EUR
  { id: 'wp_29', kasaId: 'wildpark', name: 'Ç.V.WP+ XD',      category: 'Çapraz Visitor', adultPrice: 33, childPrice: 23, currency: 'EUR' },
  { id: 'wp_30', kasaId: 'wildpark', name: 'Ç.V.WP + F2F',    category: 'Çapraz Visitor', adultPrice: 38, childPrice: 28, currency: 'EUR' },
  { id: 'wp_31', kasaId: 'wildpark', name: 'Ç.V.WP+F2F+XD',   category: 'Çapraz Visitor', adultPrice: 48, childPrice: 38, currency: 'EUR' },
  { id: 'wp_32', kasaId: 'wildpark', name: 'MARKET3 VISITOR',  category: 'Çapraz Visitor', adultPrice: 29, childPrice: 19, currency: 'EUR' },
  // Acenta - USD
  { id: 'wp_33', kasaId: 'wildpark', name: 'Acenta $12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'USD' },
  { id: 'wp_34', kasaId: 'wildpark', name: 'Acenta $11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'USD' },
  { id: 'wp_35', kasaId: 'wildpark', name: 'Acenta $10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 'wp_36', kasaId: 'wildpark', name: 'Acenta $9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'USD' },
  { id: 'wp_37', kasaId: 'wildpark', name: 'Acenta $8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'USD' },
  { id: 'wp_38', kasaId: 'wildpark', name: 'Acenta $7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'USD' },
  { id: 'wp_39', kasaId: 'wildpark', name: 'Acenta $6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'USD' },
  // Acenta - EUR
  { id: 'wp_40', kasaId: 'wildpark', name: 'Acenta €12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'EUR' },
  { id: 'wp_41', kasaId: 'wildpark', name: 'Acenta €11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'EUR' },
  { id: 'wp_42', kasaId: 'wildpark', name: 'Acenta €10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 'wp_43', kasaId: 'wildpark', name: 'Acenta €9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'EUR' },
  { id: 'wp_44', kasaId: 'wildpark', name: 'Acenta €8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'EUR' },
  { id: 'wp_45', kasaId: 'wildpark', name: 'Acenta €7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'EUR' },
  { id: 'wp_46', kasaId: 'wildpark', name: 'Acenta €6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'EUR' },

  // ─── FACE2FACE ────────────────────────────────────────────────────────────────
  // Münferit - TL
  { id: 'f2f_1',  kasaId: 'face2face', name: 'M.Y',                 category: 'Münferit', adultPrice: 340, childPrice: 255, currency: 'TL' },
  { id: 'f2f_2',  kasaId: 'face2face', name: 'M.Y%15',              category: 'Münferit', adultPrice: 289, childPrice: 217, currency: 'TL' },
  { id: 'f2f_3',  kasaId: 'face2face', name: 'M.Y%20',              category: 'Münferit', adultPrice: 272, childPrice: 204, currency: 'TL' },
  { id: 'f2f_4',  kasaId: 'face2face', name: 'M.Y%30',              category: 'Münferit', adultPrice: 238, childPrice: 179, currency: 'TL' },
  { id: 'f2f_5',  kasaId: 'face2face', name: 'M.Y%40',              category: 'Münferit', adultPrice: 204, childPrice: 153, currency: 'TL' },
  { id: 'f2f_6',  kasaId: 'face2face', name: 'M.Y%50',              category: 'Münferit', adultPrice: 170, childPrice: 128, currency: 'TL' },
  { id: 'f2f_7',  kasaId: 'face2face', name: 'M.Kurum',             category: 'Münferit', adultPrice: 238, childPrice: 179, currency: 'TL' },
  { id: 'f2f_8',  kasaId: 'face2face', name: 'Family',              category: 'Münferit', adultPrice: 245, childPrice: 180, currency: 'TL' },
  { id: 'f2f_9',  kasaId: 'face2face', name: 'Öğrenci',             category: 'Münferit', adultPrice: 150, childPrice: 130, currency: 'TL' },
  { id: 'f2f_10', kasaId: 'face2face', name: 'Öğrenci/Acenta/Kreş', category: 'Münferit', adultPrice: 130, childPrice: 115, currency: 'TL' },
  // Visitor - USD
  { id: 'f2f_11', kasaId: 'face2face', name: 'Visitor', category: 'Visitor', adultPrice: 23, childPrice: 18, currency: 'USD' },
  { id: 'f2f_12', kasaId: 'face2face', name: 'V%25',    category: 'Visitor', adultPrice: 17, childPrice: 14, currency: 'USD' },
  { id: 'f2f_13', kasaId: 'face2face', name: 'V%35',    category: 'Visitor', adultPrice: 15, childPrice: 12, currency: 'USD' },
  { id: 'f2f_14', kasaId: 'face2face', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 'f2f_15', kasaId: 'face2face', name: 'V%50',    category: 'Visitor', adultPrice: 12, childPrice:  9, currency: 'USD' },
  // Visitor - EUR
  { id: 'f2f_16', kasaId: 'face2face', name: 'Visitor', category: 'Visitor', adultPrice: 22, childPrice: 17, currency: 'EUR' },
  { id: 'f2f_17', kasaId: 'face2face', name: 'V%25',    category: 'Visitor', adultPrice: 16, childPrice: 13, currency: 'EUR' },
  { id: 'f2f_18', kasaId: 'face2face', name: 'V%35',    category: 'Visitor', adultPrice: 14, childPrice: 11, currency: 'EUR' },
  { id: 'f2f_19', kasaId: 'face2face', name: 'V%Özel',  category: 'Visitor', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 'f2f_20', kasaId: 'face2face', name: 'V%50',    category: 'Visitor', adultPrice: 11, childPrice:  9, currency: 'EUR' },
  // Çapraz Münferit - TL
  { id: 'f2f_21', kasaId: 'face2face', name: 'Ç.F2F+ XD',       category: 'Çapraz Münferit', adultPrice: 450, childPrice: 350, currency: 'TL' },
  { id: 'f2f_22', kasaId: 'face2face', name: 'Ç.F2F + WP',       category: 'Çapraz Münferit', adultPrice: 510, childPrice: 390, currency: 'TL' },
  { id: 'f2f_23', kasaId: 'face2face', name: 'Ç.F2F+WP+XD',      category: 'Çapraz Münferit', adultPrice: 690, childPrice: 510, currency: 'TL' },
  { id: 'f2f_24', kasaId: 'face2face', name: 'MARKET3',           category: 'Çapraz Münferit', adultPrice: 536, childPrice: 404, currency: 'TL' },
  // Çapraz Visitor - USD
  { id: 'f2f_25', kasaId: 'face2face', name: 'Ç.V.F2F+ XD',      category: 'Çapraz Visitor', adultPrice: 35, childPrice: 25, currency: 'USD' },
  { id: 'f2f_26', kasaId: 'face2face', name: 'Ç.V.F2F + WP',     category: 'Çapraz Visitor', adultPrice: 40, childPrice: 30, currency: 'USD' },
  { id: 'f2f_27', kasaId: 'face2face', name: 'Ç.V.F2F+WP+XD',    category: 'Çapraz Visitor', adultPrice: 50, childPrice: 40, currency: 'USD' },
  { id: 'f2f_28', kasaId: 'face2face', name: 'MARKET3 VISITOR',   category: 'Çapraz Visitor', adultPrice: 30, childPrice: 20, currency: 'USD' },
  // Çapraz Visitor - EUR
  { id: 'f2f_29', kasaId: 'face2face', name: 'Ç.V.F2F+ XD',      category: 'Çapraz Visitor', adultPrice: 33, childPrice: 23, currency: 'EUR' },
  { id: 'f2f_30', kasaId: 'face2face', name: 'Ç.V.F2F + WP',     category: 'Çapraz Visitor', adultPrice: 38, childPrice: 28, currency: 'EUR' },
  { id: 'f2f_31', kasaId: 'face2face', name: 'Ç.V.F2F+WP+XD',    category: 'Çapraz Visitor', adultPrice: 48, childPrice: 38, currency: 'EUR' },
  { id: 'f2f_32', kasaId: 'face2face', name: 'MARKET3 VISITOR',   category: 'Çapraz Visitor', adultPrice: 29, childPrice: 19, currency: 'EUR' },
  // Acenta - USD
  { id: 'f2f_33', kasaId: 'face2face', name: 'Acenta $12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'USD' },
  { id: 'f2f_34', kasaId: 'face2face', name: 'Acenta $11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'USD' },
  { id: 'f2f_35', kasaId: 'face2face', name: 'Acenta $10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'USD' },
  { id: 'f2f_36', kasaId: 'face2face', name: 'Acenta $9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'USD' },
  { id: 'f2f_37', kasaId: 'face2face', name: 'Acenta $8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'USD' },
  { id: 'f2f_38', kasaId: 'face2face', name: 'Acenta $7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'USD' },
  { id: 'f2f_39', kasaId: 'face2face', name: 'Acenta $6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'USD' },
  // Acenta - EUR
  { id: 'f2f_40', kasaId: 'face2face', name: 'Acenta €12', category: 'Acenta', adultPrice: 12, childPrice: 12, currency: 'EUR' },
  { id: 'f2f_41', kasaId: 'face2face', name: 'Acenta €11', category: 'Acenta', adultPrice: 11, childPrice: 11, currency: 'EUR' },
  { id: 'f2f_42', kasaId: 'face2face', name: 'Acenta €10', category: 'Acenta', adultPrice: 10, childPrice: 10, currency: 'EUR' },
  { id: 'f2f_43', kasaId: 'face2face', name: 'Acenta €9',  category: 'Acenta', adultPrice:  9, childPrice:  9, currency: 'EUR' },
  { id: 'f2f_44', kasaId: 'face2face', name: 'Acenta €8',  category: 'Acenta', adultPrice:  8, childPrice:  8, currency: 'EUR' },
  { id: 'f2f_45', kasaId: 'face2face', name: 'Acenta €7',  category: 'Acenta', adultPrice:  7, childPrice:  7, currency: 'EUR' },
  { id: 'f2f_46', kasaId: 'face2face', name: 'Acenta €6',  category: 'Acenta', adultPrice:  6, childPrice:  6, currency: 'EUR' },
  // FACE Acenta -8- (sadece Face2Face'te var)
  { id: 'f2f_47', kasaId: 'face2face', name: 'Acenta $5',  category: 'Acenta', adultPrice:  5, childPrice:  5, currency: 'USD' },
  { id: 'f2f_48', kasaId: 'face2face', name: 'Acenta €5',  category: 'Acenta', adultPrice:  5, childPrice:  5, currency: 'EUR' },

  // ─── FREE PAKETLER (Ücretsiz giriş) ──────────────────────────────────────────
  { id: 's_free',   kasaId: 'sinema',    name: 'FREE',  category: 'Münferit', adultPrice: 0, childPrice: 0, currency: 'TL' },
  { id: 'wp_free',  kasaId: 'wildpark',  name: 'FREE',  category: 'Münferit', adultPrice: 0, childPrice: 0, currency: 'TL' },
  { id: 'f2f_free', kasaId: 'face2face', name: 'FREE',  category: 'Münferit', adultPrice: 0, childPrice: 0, currency: 'TL' },
];
