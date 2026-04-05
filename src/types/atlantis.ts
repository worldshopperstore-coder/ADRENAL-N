/* ──────────────────────────────────────────────────────────
   Atlantis AquariumDB3 Tip Tanımları
   SQL Server 192.168.7.9 / AquariumDB3
   ────────────────────────────────────────────────────────── */

// ── Veritabanı Tabloları ──────────────────────────────────

export interface TerminalRecord {
  Id: number;
  Comment: string | null;
  PrimaryAccount: string | null;
  SecondaryAccount: string | null;
  CreateDate: string;
  UpdateDate: string;
  CreatedBy: string;
  UpdatedBy: string;
  ExtraJson: string | null;
  IsDeleted: boolean;
  ReservationId: number | null;
  MarketId: number;
  RegionId: number;
  TerminalAccountId: number;
  TourGuideId: number | null;
  IsInvoice: boolean;
  ContractId: number;            // -> Contracts.Id
  IsCashRegister: boolean;
  IsCurrentAccount: boolean;
  State: number;
}

export interface Ticket {
  Id: number;
  ContractId: number;            // -> Contracts.Id
  TerminalRecordId: number;      // -> TerminalRecords.Id
  TicketTypeId: number;          // -> ContractTicketTypes.Id (NOT TicketTypes.Id directly)
  CreateDate: string;
  UpdateDate: string;
  CreatedBy: string;
  UpdatedBy: string;
  ExtraJson: string | null;
  IsDeleted: boolean;
  ProductId: number;             // -> ContractProducts.Id
  ExpiryDate: string;
  IsUsed: boolean;
  GateId: number | null;
  GateLocation: number | null;
  PriceId: number;               // -> ContractProductPrices.Id
  StartDate: string;
  IsReturned: boolean;
  UseDate: string | null;
  TicketGroupId: number;         // Groups tickets for same person (combo)
}

export interface TerminalTransaction {
  Id: number;
  TerminalRecordId: number;
  Amount: number;
  PaymentTypeId: number;         // 2=Kredi Kartı, 3=Nakit
  CurrencyId: number;            // 1=USD, 2=EUR, 3=TRY
  ExchangeRateId: number | null;
  CreateDate: string;
  UpdateDate: string;
  CreatedBy: string;
  UpdatedBy: string;
  ExtraJson: string | null;
  IsDeleted: boolean;
}

// ── Kontrat Yapısı ────────────────────────────────────────

export interface ContractHeader {
  Id: number;
  Comment: string;               // e.g. 'CINE M.Y.'
  ContractGroupId: number;
  CurrencyId: number;            // 1=USD, 2=EUR, 3=TRY
  IsActive: boolean;
}

export interface Contract {
  Id: number;
  ContractHeaderId: number;
  Priority: number;
}

export interface ContractProduct {
  Id: number;
  ContractId: number;
  ProductId: number;             // -> Products.Id (1004=WP, 1005=CINE, 1008=F2F, 1011=VR360)
}

export interface ContractProductPrice {
  Id: number;
  ContractProductId: number;
  TicketTypeId: number;          // -> ContractTicketTypes.Id
  Price: number;
}

export interface ContractTicketType {
  Id: number;
  TypeId: number;                // -> TicketTypes.Id (1=ADU, 2=CHL, 3=COMP, 4=REBT)
  Comment: string;
}

// ── Sabitler ──────────────────────────────────────────────

export const PAYMENT_TYPES = {
  KREDI_KARTI: 2,
  NAKIT: 3,
} as const;

export const CURRENCIES = {
  USD: 1,
  EUR: 2,
  TRY: 3,
} as const;

export const TICKET_TYPES = {
  ADU: 1,  // TicketTypes.Id
  CHL: 2,
  COMP: 3,
  REBT: 4,
} as const;

export const PRODUCTS = {
  WILDPARK_ENTRANCE: 1004,
  CINEMA_ENTRANCE: 1005,
  FACE2FACE_ENTRANCE: 1008,
  VR360: 1011,
} as const;

export const CONTRACT_GROUPS = {
  PRUVA_MUNFERIT: 1,
  PRUVA_ACENTE: 2,
  WILDPARK_ACENTE: 3,
  WILDPARK_MUNFERIT: 5,
  CINEMA_ACENTE: 10,
  CINEMA_MUNFERIT: 11,
  ORTAK_ACENTE: 12,
} as const;

// Gate bilgileri: kasa -> hangi gate'e bilet basacak
export const GATE_CONFIG = {
  wildpark:  { gateId: 3, gateLocation: 1 },  // WildPark turnstile
  sinema:    { gateId: 2, gateLocation: 1 },  // Cinema turnstile
  face2face: { gateId: 1, gateLocation: 1 },  // Face2Face turnstile
} as const;

// Terminal Account: kasa -> TerminalAccountId
export const TERMINAL_ACCOUNTS = {
  wildpark:  1,  // GISE-1
  sinema:    2,  // GISE-2
  face2face: 3,  // GISE-3
} as const;

// ── POS Server Tipleri ────────────────────────────────────

export enum PosOutputType {
  Invoice = 0,
  Receipt = 1,
}

export enum PosPaymentType {
  CreditCard = 0,
  Cash = 1,
}

export enum PosTransactionStatus {
  Ok = 0,
  SentToPos = 1,
  Query = 2,
  Error = 3,
}

export enum PosSecondaryDataFormat {
  None = 0,
  PsBarcode = 256,
  PsQR = 2048,
}

export interface PosCartProduct {
  Name: string;
  Quantity: number;
  Price: number;
  PriceInt: number;              // Kuruş cinsinden fiyat (Price * 100)
  Tax: number;
  TaxInt: number;                // Kuruş cinsinden vergi (Tax * 100)
  SecondaryData: string | null;  // QR code data = ticket Id
  SecondaryDataFormat: PosSecondaryDataFormat;
  PLUBarcode: string | null;
}

export interface PosCartPayment {
  PaymentType: PosPaymentType;
  Amount: number;
  AmountInt: number;             // Kuruş cinsinden tutar (Amount * 100)
}

export interface PosInvoiceInfo {
  Title: string;
  TaxNo: string;
  TaxOffice: string;
  Address: string;
}

export interface PosTransactionData {
  Id: string;
  OutputType: PosOutputType;
  InvoiceInfo: PosInvoiceInfo | null;
  TransactionStatus: PosTransactionStatus;    // İstek: 1 (SentToPos), Yanıt: 0 (Ok) / 3 (Error)
  TransactionMessage: string | null;
  TransactionErrorCode: number | null;
  CartProducts: PosCartProduct[];
  CartPayments: PosCartPayment[];
}

// ── Satış İşlem Tipleri ───────────────────────────────────

/** Her bir ContractProduct için oluşturulacak bilet bilgisi */
export interface TicketSpec {
  contractProductId: number;     // ContractProducts.Id -> Tickets.ProductId
  contractTicketTypeId: number;  // ContractTicketTypes.Id -> Tickets.TicketTypeId
  priceId: number;               // ContractProductPrices.Id -> Tickets.PriceId
  price: number;                 // Fiyat
  productId: number;             // Products.Id (1004/1005/1008)
  productName: string;           // WILDPARK/CINEMA/F2F
  gateId: number | null;
  gateLocation: number | null;
}

/** Tam satış paketi bilgisi — DB'ye yazılacak her şey */
export interface SalePayload {
  contractId: number;            // Contracts.Id -> TerminalRecords.ContractId & Tickets.ContractId
  contractHeaderId: number;      // UI referans için
  contractName: string;          // Kontrat adı
  terminalAccountId: number;     // Kasa -> TerminalAccountId
  createdBy: string;             // Personel adı
  comment?: string;              // Açıklama -> TerminalRecords.Comment
  
  // Bilet bilgileri
  tickets: {
    ticketTypeLabel: 'ADU' | 'CHL' | 'COMP';
    quantity: number;
    specs: TicketSpec[];         // Her ContractProduct için ayrı spec (combo'da 2+)
  }[];
  
  // Ödeme bilgileri
  payments: {
    amount: number;
    paymentTypeId: number;       // 2=KK, 3=Nakit
    currencyId: number;          // 1=USD, 2=EUR, 3=TRY
    exchangeRateId: number | null;
  }[];
  
  // Toplam
  totalAmount: number;
  currencyId: number;
}

/** pos_bridge.py'den dönen yanıt */
export interface BridgeResponse {
  success: boolean;
  terminalRecordId?: number;
  ticketIds?: number[];
  ticketGroupMap?: Record<number, number[]>;  // ticketGroupId -> ticketId[]
  error?: string;
}

// ── Entegrasyon Ayarları ──────────────────────────────────

export interface IntegrationSettings {
  enabled: boolean;              // Aktif/Pasif mod
  sqlServer: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  pos: {
    enabled: boolean;
    ip: string;
    port: number;
    tax: number;                 // KDV oranı (20)
    invoiceType: PosOutputType;
    receiptLimit: number;        // 3999
  };
  printer: {
    enabled: boolean;
    name: string;                // 'ZDesigner ZD220-203dpi ZPL'
  };
  bridge: {
    host: string;                // '127.0.0.1'
    port: number;                // 5555
  };
}

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  enabled: false,
  sqlServer: {
    host: '192.168.7.9',
    port: 1433,
    database: 'AquariumDB3',
    username: 'sa',
    password: 'Atl@2022!',
  },
  pos: {
    enabled: true,
    ip: '127.0.0.1',
    port: 9960,
    tax: 20,
    invoiceType: PosOutputType.Receipt,
    receiptLimit: 3999,
  },
  printer: {
    enabled: true,
    name: 'ZDesigner ZD220-203dpi ZPL',
  },
  bridge: {
    host: '127.0.0.1',
    port: 5555,
  },
};
