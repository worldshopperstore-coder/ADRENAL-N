// Çapraz satış sabit hak ediş tablosu (PDF'den)
// Her paketin satan kasaya, para birimine göre sabit mekan payları
// Değerler: { adult: number, child: number } — birim fiyat (kişi başı)

export type CrossPackageType = 'F2F_XD' | 'F2F_W' | 'F2F_XD_W' | 'MARKET3';
export type SellerKasa = 'sinema' | 'wildpark' | 'face2face';
export type ShareCurrency = 'TL' | 'USD' | 'EUR';

interface VenueShare {
  adult: number;
  child: number;
}

interface PackageShares {
  f2f: VenueShare;
  xd: VenueShare;
  wp: VenueShare;
}

// CROSS_SALE_SHARES[satanKasa][paketTipi][currency] = { f2f, xd, wp }
export const CROSS_SALE_SHARES: Record<SellerKasa, Partial<Record<CrossPackageType, Record<ShareCurrency, PackageShares>>>> = {
  // ─── SİNEMA (XD) SATIYOR ─────────────────────────────────────
  sinema: {
    F2F_XD: {
      TL:  { f2f: { adult: 200, child: 150 }, xd: { adult: 250, child: 200 }, wp: { adult: 0, child: 0 } },
      USD: { f2f: { adult: 14,  child: 10  }, xd: { adult: 21,  child: 15  }, wp: { adult: 0, child: 0 } },
      EUR: { f2f: { adult: 12,  child: 10  }, xd: { adult: 21,  child: 13  }, wp: { adult: 0, child: 0 } },
    },
    // Sinema F2F&W satamaz — tanımlanmıyor
    F2F_XD_W: {
      TL:  { f2f: { adult: 300, child: 190 }, xd: { adult: 250, child: 200 }, wp: { adult: 140, child: 120 } },
      USD: { f2f: { adult: 18,  child: 13  }, xd: { adult: 22,  child: 16  }, wp: { adult: 10,  child: 11  } },
      EUR: { f2f: { adult: 18,  child: 12  }, xd: { adult: 23,  child: 15  }, wp: { adult: 7,   child: 11  } },
    },
    MARKET3: {
      TL:  { f2f: { adult: 200, child: 140 }, xd: { adult: 226, child: 210 }, wp: { adult: 110, child: 54  } },
      USD: { f2f: { adult: 10,  child: 6   }, xd: { adult: 14,  child: 11  }, wp: { adult: 6,   child: 3   } },
      EUR: { f2f: { adult: 10,  child: 7   }, xd: { adult: 14,  child: 9   }, wp: { adult: 5,   child: 3   } },
    },
  },

  // ─── WİLDPARK SATIYOR ────────────────────────────────────────
  wildpark: {
    // WildPark F2F&XD satamaz — tanımlanmıyor
    F2F_W: {
      TL:  { f2f: { adult: 170, child: 130 }, xd: { adult: 0, child: 0 }, wp: { adult: 340, child: 260 } },
      USD: { f2f: { adult: 14,  child: 9   }, xd: { adult: 0, child: 0 }, wp: { adult: 26,  child: 21  } },
      EUR: { f2f: { adult: 13,  child: 10  }, xd: { adult: 0, child: 0 }, wp: { adult: 25,  child: 18  } },
    },
    F2F_XD_W: {
      TL:  { f2f: { adult: 190, child: 150 }, xd: { adult: 140, child: 80  }, wp: { adult: 360, child: 280 } },
      USD: { f2f: { adult: 13,  child: 11  }, xd: { adult: 10,  child: 8   }, wp: { adult: 27,  child: 21  } },
      EUR: { f2f: { adult: 15,  child: 11  }, xd: { adult: 8,   child: 7   }, wp: { adult: 25,  child: 20  } },
    },
    MARKET3: {
      TL:  { f2f: { adult: 165, child: 140 }, xd: { adult: 95,  child: 53  }, wp: { adult: 275, child: 210 } },
      USD: { f2f: { adult: 9,   child: 6   }, xd: { adult: 6,   child: 3   }, wp: { adult: 15,  child: 11  } },
      EUR: { f2f: { adult: 10,  child: 5   }, xd: { adult: 5,   child: 4   }, wp: { adult: 14,  child: 10  } },
    },
  },

  // ─── FACE2FACE (PRUVA) SATIYOR ───────────────────────────────
  face2face: {
    F2F_XD: {
      TL:  { f2f: { adult: 350, child: 260 }, xd: { adult: 100, child: 90  }, wp: { adult: 0, child: 0 } },
      USD: { f2f: { adult: 26,  child: 16  }, xd: { adult: 9,   child: 9   }, wp: { adult: 0, child: 0 } },
      EUR: { f2f: { adult: 24,  child: 14  }, xd: { adult: 9,   child: 9   }, wp: { adult: 0, child: 0 } },
    },
    F2F_W: {
      TL:  { f2f: { adult: 340, child: 260 }, xd: { adult: 0, child: 0 }, wp: { adult: 170, child: 130 } },
      USD: { f2f: { adult: 26,  child: 21  }, xd: { adult: 0, child: 0 }, wp: { adult: 14,  child: 9   } },
      EUR: { f2f: { adult: 25,  child: 18  }, xd: { adult: 0, child: 0 }, wp: { adult: 13,  child: 10  } },
    },
    F2F_XD_W: {
      TL:  { f2f: { adult: 360, child: 280 }, xd: { adult: 140, child: 80  }, wp: { adult: 190, child: 150 } },
      USD: { f2f: { adult: 27,  child: 21  }, xd: { adult: 10,  child: 8   }, wp: { adult: 13,  child: 11  } },
      EUR: { f2f: { adult: 25,  child: 20  }, xd: { adult: 8,   child: 7   }, wp: { adult: 15,  child: 11  } },
    },
    MARKET3: {
      TL:  { f2f: { adult: 275, child: 210 }, xd: { adult: 95,  child: 53  }, wp: { adult: 165, child: 140 } },
      USD: { f2f: { adult: 15,  child: 11  }, xd: { adult: 6,   child: 3   }, wp: { adult: 9,   child: 6   } },
      EUR: { f2f: { adult: 14,  child: 10  }, xd: { adult: 5,   child: 4   }, wp: { adult: 10,  child: 5   } },
    },
  },
};

/**
 * Paket adından CrossPackageType belirle.
 * Sadece F2F içeren çapraz paketler döner, diğerleri null.
 */
export function detectCrossPackageType(packageName: string): CrossPackageType | null {
  const name = packageName.toUpperCase();

  // MARKET3 / MARKET 3
  if (name.includes('MARKET3') || name.includes('MARKET 3')) return 'MARKET3';

  const hasF2F = name.includes('F2F') || name.includes('FACE');
  const hasXD = name.includes('XD') || name.includes('SİNEMA') || name.includes('SINEMA');
  const hasWP = name.includes('WP') || name.includes('WILD');

  if (!hasF2F) return null; // F2F yoksa mutabakatta geçersiz

  if (hasF2F && hasXD && hasWP) return 'F2F_XD_W';
  if (hasF2F && hasXD) return 'F2F_XD';
  if (hasF2F && hasWP) return 'F2F_W';

  return null;
}
