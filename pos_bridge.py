#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pos_bridge.py — Atlantis AquariumDB3 SQL Server Köprüsü
Electron app tarafından child_process olarak başlatılır.
HTTP API (Flask-free, sadece http.server) port 5555.

Fonksiyonlar:
  POST /sale          → Satış INSERT (TerminalRecords + Tickets + TerminalTransactions)
  POST /refund        → İade (soft delete)
  GET  /health        → Bağlantı kontrolü
  GET  /today-sales   → Bugünkü satış sayısı
"""

import json
import sys
import os
import signal
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

try:
    import pymssql
except ImportError:
    print("HATA: pymssql yüklü değil. pip install pymssql", file=sys.stderr)
    sys.exit(1)

# ── Yapılandırma ───────────────────────────────────────────
DB_HOST = os.environ.get('DB_HOST', '192.168.7.9')
DB_PORT = int(os.environ.get('DB_PORT', '1433'))
DB_NAME = os.environ.get('DB_NAME', 'AquariumDB3')
DB_USER = os.environ.get('DB_USER', 'sa')
DB_PASS = os.environ.get('DB_PASS', 'Atl@2022!')
BRIDGE_HOST = os.environ.get('BRIDGE_HOST', '0.0.0.0')
BRIDGE_PORT = int(os.environ.get('BRIDGE_PORT', '5555'))

conn = None

def get_connection():
    """Lazy SQL Server bağlantısı"""
    global conn
    if conn is None:
        conn = pymssql.connect(
            server=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            charset='utf8',
            login_timeout=10,
            timeout=30,
        )
        conn.autocommit(False)
    return conn


def close_connection():
    global conn
    if conn:
        try:
            conn.close()
        except:
            pass
        conn = None


def reconnect():
    close_connection()
    return get_connection()


# ── Satış İşlemi ──────────────────────────────────────────

def process_sale(payload: dict) -> dict:
    """
    Satış INSERT işlemi.
    
    payload = {
      "contractId": 868,
      "terminalAccountId": 2,
      "createdBy": "Ahmet",
      "tickets": [
        {
          "ticketTypeLabel": "ADU",
          "quantity": 2,
          "specs": [
            {
              "contractProductId": 1222,
              "contractTicketTypeId": 86,
              "priceId": 2705,
              "price": 499.0,
              "productId": 1005,
              "gateId": 2,
              "gateLocation": 1
            },
            {
              "contractProductId": 1221,
              "contractTicketTypeId": 86,
              "priceId": 2703,
              "price": 1.0,
              "productId": 1004,
              "gateId": 3,
              "gateLocation": 1
            }
          ]
        }
      ],
      "payments": [
        { "amount": 1000, "paymentTypeId": 2, "currencyId": 3, "exchangeRateId": null }
      ]
    }
    """
    try:
        db = get_connection()
        cur = db.cursor()
        now = datetime.datetime.now()
        now_str = now.strftime('%Y-%m-%dT%H:%M:%S.') + f'{now.microsecond // 1000:03d}'
        created_by = payload.get('createdBy', 'ADRENALIN')
        contract_id = payload['contractId']
        terminal_account_id = payload['terminalAccountId']
        comment = payload.get('comment') or None  # Açıklama alanı

        # 1) TerminalRecords INSERT
        cur.execute("""
            INSERT INTO TerminalRecords
                (Comment, PrimaryAccount, SecondaryAccount, CreateDate, UpdateDate,
                 CreatedBy, UpdatedBy, ExtraJson, IsDeleted, ReservationId,
                 MarketId, RegionId, TerminalAccountId, TourGuideId, IsInvoice,
                 ContractId, IsCashRegister, IsCurrentAccount, State)
            VALUES
                (%s, NULL, NULL, %s, %s,
                 %s, %s, NULL, 0, NULL,
                 1, 1, %s, NULL, 0,
                 %s, 1, 0, 0);
            SELECT SCOPE_IDENTITY();
        """, (comment, now_str, now_str, created_by, created_by, terminal_account_id, contract_id))
        
        terminal_record_id = int(cur.fetchone()[0])
        
        # 2) Tickets INSERT — her kişi için ticketGroupId atanır
        ticket_ids = []
        ticket_group_map = {}  # ticketGroupId -> [ticketId, ...]
        
        # Son TicketGroupId'yi bul (bu record için)
        # TicketGroupId her kişi (ADU/CHL) için ayrı, combo'da aynı kişinin biletleri aynı groupId'yi paylaşır
        ticket_group_counter = 0
        
        # Bilet tarihi: bugün gece yarısı (Atlantis formatı: 00:00:00.000)
        start_str = now.replace(hour=0, minute=0, second=0, microsecond=0).strftime('%Y-%m-%dT%H:%M:%S.000')
        expiry_str = start_str  # ExpiryDate = StartDate = bugün 00:00
        
        for ticket_group in payload['tickets']:
            qty = ticket_group['quantity']
            specs = ticket_group['specs']  # combo'da 2+ spec olabilir
            
            for person_idx in range(qty):
                ticket_group_counter += 1
                group_ticket_ids = []
                
                for spec in specs:
                    cur.execute("""
                        INSERT INTO Tickets
                            (ContractId, TerminalRecordId, TicketTypeId, CreateDate, UpdateDate,
                             CreatedBy, UpdatedBy, ExtraJson, IsDeleted, ProductId,
                             ExpiryDate, IsUsed, GateId, GateLocation, PriceId,
                             StartDate, IsReturned, UseDate, TicketGroupId)
                        VALUES
                            (%s, %s, %s, %s, %s,
                             %s, %s, NULL, 0, %s,
                             %s, 0, %s, %s, %s,
                             %s, 0, NULL, %s);
                        SELECT SCOPE_IDENTITY();
                    """, (
                        contract_id,
                        terminal_record_id,
                        spec['contractTicketTypeId'],
                        now_str, now_str,
                        created_by, created_by,
                        spec['contractProductId'],
                        expiry_str,
                        spec.get('gateId'),
                        spec.get('gateLocation'),
                        spec['priceId'],
                        start_str,
                        ticket_group_counter,
                    ))
                    
                    tid = int(cur.fetchone()[0])
                    ticket_ids.append(tid)
                    group_ticket_ids.append(tid)
                
                ticket_group_map[ticket_group_counter] = group_ticket_ids
        
        # 3) Bugünkü ExchangeRateId'leri çek (CurrencyFromId bazında)
        today_date = datetime.date.today()
        cur.execute("""
            SELECT CurrencyFromId, Id FROM ExchangeRates
            WHERE CAST(ForDate AS DATE) = %s AND IsDeleted = 0
        """, (today_date,))
        exchange_rate_map = {}
        for row in cur.fetchall():
            exchange_rate_map[row[0]] = row[1]
        # Fallback: bugün yoksa en son kaydı al
        if not exchange_rate_map:
            cur.execute("""
                SELECT CurrencyFromId, Id FROM ExchangeRates
                WHERE IsDeleted = 0 AND Id IN (
                    SELECT MAX(Id) FROM ExchangeRates WHERE IsDeleted = 0 GROUP BY CurrencyFromId
                )
            """)
            for row in cur.fetchall():
                exchange_rate_map[row[0]] = row[1]
        
        # 4) TerminalTransactions INSERT — ödeme kayıtları
        for payment in payload['payments']:
            currency_id = payment['currencyId']
            # CurrencyId → ExchangeRates.CurrencyFromId eşlemesi (aynı ID'ler: 1=USD, 2=EUR, 3=TRY)
            exchange_rate_id = exchange_rate_map.get(currency_id, exchange_rate_map.get(3))  # fallback TRY
            
            cur.execute("""
                INSERT INTO TerminalTransactions
                    (TerminalRecordId, Amount, PaymentTypeId, CurrencyId, ExchangeRateId,
                     CreateDate, UpdateDate, CreatedBy, UpdatedBy, ExtraJson, IsDeleted)
                VALUES
                    (%s, %s, %s, %s, %s,
                     %s, %s, %s, %s, NULL, 0);
            """, (
                terminal_record_id,
                payment['amount'],
                payment['paymentTypeId'],
                currency_id,
                exchange_rate_id,
                now_str, now_str,
                created_by, created_by,
            ))
        
        # 5) TerminalQuantities INSERT — G.ADU/G.CHL sayıları için
        # Contract'ın tüm CTT'lerini DB'den çek (ContractHeaders → CTTCH → CTT)
        cur.execute("""
            SELECT DISTINCT cttch.ContractTicketType_Id
            FROM ContractTicketTypeContractHeaders cttch
            JOIN ContractHeaders ch ON ch.Id = cttch.ContractHeader_Id
            JOIN Contracts c ON c.ContractHeaderId = ch.Id
            WHERE c.Id = %s AND ch.IsDeleted = 0
            ORDER BY cttch.ContractTicketType_Id
        """, (contract_id,))
        all_ctt_ids = [row[0] for row in cur.fetchall()]
        
        # Payload'dan hangi CTT'den kaç kişi olduğunu hesapla
        ctt_quantity_map = {}
        for ticket_group in payload['tickets']:
            qty = ticket_group['quantity']
            specs = ticket_group['specs']
            if specs:
                ctt_id = specs[0]['contractTicketTypeId']
                ctt_quantity_map[ctt_id] = ctt_quantity_map.get(ctt_id, 0) + qty
        
        # DB'den gelen tüm CTT'ler için satır yaz (quantity=0 olsa bile)
        for ctt_id in all_ctt_ids:
            qty = ctt_quantity_map.get(ctt_id, 0)
            cur.execute("""
                INSERT INTO TerminalQuantities
                    (TicketTypeId, TerminalRecordId, Quantity,
                     CreateDate, UpdateDate, CreatedBy, UpdatedBy, ExtraJson, IsDeleted)
                VALUES
                    (%s, %s, %s,
                     %s, %s, %s, %s, NULL, 0);
            """, (ctt_id, terminal_record_id, qty, now_str, now_str, created_by, created_by))
        
        # Eğer DB'de CTT bulunamazsa, en azından payload'daki CTT'leri yaz
        if not all_ctt_ids:
            for ctt_id, qty in ctt_quantity_map.items():
                cur.execute("""
                    INSERT INTO TerminalQuantities
                        (TicketTypeId, TerminalRecordId, Quantity,
                         CreateDate, UpdateDate, CreatedBy, UpdatedBy, ExtraJson, IsDeleted)
                    VALUES
                        (%s, %s, %s,
                         %s, %s, %s, %s, NULL, 0);
                """, (ctt_id, terminal_record_id, qty, now_str, now_str, created_by, created_by))
        
        db.commit()
        
        return {
            'success': True,
            'terminalRecordId': terminal_record_id,
            'ticketIds': ticket_ids,
            'ticketGroupMap': {str(k): v for k, v in ticket_group_map.items()},
        }
        
    except Exception as e:
        try:
            db.rollback()
        except:
            pass
        # Bağlantı kopmuş olabilir, yenile
        if 'connection' in str(e).lower() or 'closed' in str(e).lower():
            reconnect()
        return {'success': False, 'error': str(e)}


# ── İade (Soft Delete) ────────────────────────────────────

def process_refund(payload: dict) -> dict:
    """
    Soft delete: TerminalRecord + Tickets + Transactions → IsDeleted=1
    payload = { "terminalRecordId": 60113, "updatedBy": "Ahmet" }
    """
    try:
        db = get_connection()
        cur = db.cursor()
        now_str = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000')
        record_id = payload['terminalRecordId']
        updated_by = payload.get('updatedBy', 'ADRENALIN')
        
        cur.execute("""
            UPDATE TerminalRecords SET IsDeleted=1, UpdateDate=%s, UpdatedBy=%s WHERE Id=%s;
            UPDATE Tickets SET IsDeleted=1, UpdateDate=%s, UpdatedBy=%s WHERE TerminalRecordId=%s;
            UPDATE TerminalTransactions SET IsDeleted=1, UpdateDate=%s, UpdatedBy=%s WHERE TerminalRecordId=%s;
            UPDATE TerminalQuantities SET IsDeleted=1, UpdateDate=%s, UpdatedBy=%s WHERE TerminalRecordId=%s;
        """, (now_str, updated_by, record_id,
              now_str, updated_by, record_id,
              now_str, updated_by, record_id,
              now_str, updated_by, record_id))
        
        db.commit()
        return {'success': True, 'terminalRecordId': record_id}
        
    except Exception as e:
        try:
            db.rollback()
        except:
            pass
        return {'success': False, 'error': str(e)}


# ── Zebra ZPL Yazdırma ─────────────────────────────────────

def print_zpl(payload: dict) -> dict:
    """
    ZPL verisini Windows yazıcıya gönder.
    payload = { "zpl": "^XA...^XZ", "printer": "ZDesigner ZD220-203dpi ZPL" }
    """
    import subprocess
    import tempfile
    
    zpl_data = payload.get('zpl', '')
    printer_name = payload.get('printer', 'ZDesigner ZD220-203dpi ZPL')
    
    if not zpl_data:
        return {'success': False, 'error': 'ZPL verisi boş'}
    
    try:
        # Yöntem 1: Windows RAW yazdırma — temp dosya + copy /b
        # Bu yöntem ZPL'yi doğrudan yazıcıya gönderir (driver bypass)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.zpl', delete=False, encoding='utf-8') as f:
            f.write(zpl_data)
            temp_path = f.name
        
        # Windows'ta doğrudan yazıcıya RAW data gönder
        # copy /b dosya.zpl "\\%COMPUTERNAME%\yazıcı_adı"
        # Ama share yoksa, PowerShell ile:
        cmd = f'copy /b "{temp_path}" "\\\\%COMPUTERNAME%\\{printer_name}"'
        
        # Alternatif: winspool API ile
        try:
            result = print_raw_win32(zpl_data.encode('utf-8'), printer_name)
            # Temp dosyayı temizle
            try:
                os.unlink(temp_path)
            except:
                pass
            return result
        except Exception as e:
            # Win32 başarısız olursa, copy /b dene
            print(f"[BRIDGE] Win32 print başarısız, copy /b deneniyor: {e}", flush=True)
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
            try:
                os.unlink(temp_path)
            except:
                pass
            
            if proc.returncode == 0:
                return {'success': True}
            else:
                return {'success': False, 'error': f'copy /b hatası: {proc.stderr}'}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}


def print_raw_win32(data: bytes, printer_name: str) -> dict:
    """Windows Win32 API ile RAW yazdırma — ZPL doğrudan yazıcıya"""
    try:
        import win32print
        
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("ZPL Ticket", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, data)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        
        return {'success': True}
    
    except ImportError:
        # win32print yoksa, alternatif yöntem kullan
        raise Exception("win32print modülü yüklü değil, copy /b yöntemine geçiliyor")
    except Exception as e:
        raise Exception(f"Win32 print hatası: {e}")


# ── POS Server TCP İletişimi ────────────────────────────────

import socket
import threading

POS_HOST = os.environ.get('POS_HOST', '127.0.0.1')
POS_PORT = int(os.environ.get('POS_PORT', '9960'))
POS_TIMEOUT = 65  # saniye

# Persistent POS bağlantısı — her seferinde yeni soket açmak yerine hazır tut
_pos_sock = None
_pos_lock = threading.Lock()

def _get_pos_socket(host, port):
    """POS Server'a kalıcı soket bağlantısı — varsa yeniden kullan, yoksa aç"""
    global _pos_sock
    if _pos_sock is not None:
        try:
            # Soket hala canlı mı kontrol et
            _pos_sock.settimeout(0.1)
            _pos_sock.recv(1, socket.MSG_PEEK)
        except socket.timeout:
            # Timeout = soket canlı, sadece veri yok → OK
            return _pos_sock
        except Exception:
            # Bağlantı kopmuş, yeniden aç
            try:
                _pos_sock.close()
            except:
                pass
            _pos_sock = None

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    sock.settimeout(3)  # Bağlantı için 3s
    sock.connect((host, port))
    _pos_sock = sock
    return sock

def send_pos_payment(payload: dict) -> dict:
    """
    POS Server'a TCP üzerinden TransactionData gönderir ve yanıt bekler.
    Düz JSON gönder, düz JSON al — delimiter YOK.
    Persistent bağlantı kullanır — soket açma süresini atlar.
    """
    with _pos_lock:
        sock = None
        try:
            host = payload.pop('_host', POS_HOST)
            port = payload.pop('_port', POS_PORT)
            timeout = payload.pop('_timeout', POS_TIMEOUT)
            
            json_string = json.dumps(payload, ensure_ascii=False)
            encoded_data = json_string.encode('utf-8')
            
            print(f"[POS-TCP] Gönderiliyor → {host}:{port} ({len(encoded_data)} byte)", flush=True)
            
            try:
                sock = _get_pos_socket(host, port)
                print("[POS-TCP] Mevcut bağlantı kullanılıyor", flush=True)
            except Exception:
                # Fallback: yeni soket aç
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
                sock.settimeout(3)
                sock.connect((host, port))
                print("[POS-TCP] Yeni bağlantı açıldı", flush=True)
            
            sock.settimeout(timeout)
            sock.sendall(encoded_data)
            print("[POS-TCP] Veri gönderildi, yanıt bekleniyor...", flush=True)
            
            # Yanıt al
            response_bytes = sock.recv(8192)
            
            if response_bytes:
                # NULL byte'ları temizle
                response_str = response_bytes.decode('utf-8', errors='ignore').replace('\x00', '')
                print(f"[POS-TCP] Yanıt alındı ({len(response_bytes)} byte)", flush=True)
                
                try:
                    response = json.loads(response_str)
                    status = response.get('TransactionStatus', -1)
                    error_code = response.get('TransactionErrorCode')
                    
                    if status == 0 and (error_code is None or error_code == 0):
                        return {'success': True, 'transactionStatus': 0, 'statusMessage': 'İşlem başarılı', 'response': response}
                    else:
                        return {
                            'success': False,
                            'transactionStatus': status,
                            'statusMessage': response.get('StatusMessage', response.get('TransactionMessage', f'POS hatası (status: {status}, errorCode: {error_code})')),
                            'response': response,
                        }
                except json.JSONDecodeError:
                    return {'success': False, 'error': f'POS yanıt parse hatası: {response_str[:200]}'}
            else:
                return {'success': False, 'error': 'POS Server boş yanıt döndü'}
            
        except socket.timeout:
            return {'success': False, 'error': 'POS Server yanıt zaman aşımı (65s)'}
        except ConnectionRefusedError:
            return {'success': False, 'error': 'POS Server bağlantısı reddedildi — POS çalışmıyor olabilir'}
        except Exception as e:
            # Bağlantı kopmuşsa persistent soketi temizle
            global _pos_sock
            _pos_sock = None
            return {'success': False, 'error': f'POS TCP hatası: {str(e)}'}



# ── Bugünkü Satış Sayısı ──────────────────────────────────

def get_today_sales() -> dict:
    try:
        db = get_connection()
        cur = db.cursor()
        today = datetime.date.today().strftime('%Y-%m-%d')
        
        cur.execute("""
            SELECT COUNT(*) FROM TerminalRecords 
            WHERE CAST(CreateDate AS DATE) = %s AND IsDeleted = 0
        """, (today,))
        count = cur.fetchone()[0]
        
        cur.execute("""
            SELECT COUNT(*) FROM Tickets 
            WHERE CAST(CreateDate AS DATE) = %s AND IsDeleted = 0
        """, (today,))
        ticket_count = cur.fetchone()[0]
        
        return {'success': True, 'recordCount': count, 'ticketCount': ticket_count}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ── HTTP Handler ───────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):
    def address_string(self):
        # Reverse DNS lookup'ı devre dışı bırak — 5-15s gecikme önlenir
        return self.client_address[0]

    def log_message(self, format, *args):
        # stdout'a log yaz (Electron'un okuyabileceği)
        print(f"[BRIDGE] {args[0]}", flush=True)
    
    def _send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        path = urlparse(self.path).path
        
        if path == '/health':
            try:
                db = get_connection()
                cur = db.cursor()
                cur.execute("SELECT 1")
                cur.fetchone()
                self._send_json(200, {'status': 'ok', 'database': DB_NAME, 'host': DB_HOST})
            except Exception as e:
                self._send_json(500, {'status': 'error', 'error': str(e)})
        
        elif path == '/today-sales':
            result = get_today_sales()
            self._send_json(200 if result['success'] else 500, result)
        
        else:
            self._send_json(404, {'error': 'Not found'})
    
    def do_POST(self):
        path = urlparse(self.path).path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            payload = json.loads(body.decode('utf-8')) if body else {}
        except json.JSONDecodeError as e:
            self._send_json(400, {'error': f'Invalid JSON: {e}'})
            return
        
        if path == '/sale':
            result = process_sale(payload)
            self._send_json(200 if result['success'] else 500, result)
        
        elif path == '/refund':
            result = process_refund(payload)
            self._send_json(200 if result['success'] else 500, result)
        
        elif path == '/print':
            result = print_zpl(payload)
            self._send_json(200 if result['success'] else 500, result)
        
        elif path == '/pos-payment':
            result = send_pos_payment(payload)
            self._send_json(200 if result['success'] else 500, result)
        
        else:
            self._send_json(404, {'error': 'Not found'})


# ── Ana Giriş ─────────────────────────────────────────────

def main():
    # Graceful shutdown
    def shutdown(sig, frame):
        print("[BRIDGE] Kapatılıyor...", flush=True)
        close_connection()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    
    # Bağlantı testi
    try:
        db = get_connection()
        cur = db.cursor()
        cur.execute("SELECT DB_NAME()")
        dbname = cur.fetchone()[0]
        print(f"[BRIDGE] SQL Server bağlantısı başarılı: {dbname}@{DB_HOST}", flush=True)
    except Exception as e:
        print(f"[BRIDGE] SQL Server bağlantı hatası: {e}", file=sys.stderr, flush=True)
        # Yine de sunucuyu başlat, bağlantı sonra kurulabilir
    
    # POS Server'a ön-bağlantı kur (ilk işlem de hızlı olsun)
    try:
        _get_pos_socket(POS_HOST, int(os.environ.get('POS_PORT', POS_PORT)))
        print(f"[BRIDGE] POS Server ön-bağlantı başarılı: {POS_HOST}:{POS_PORT}", flush=True)
    except Exception as e:
        print(f"[BRIDGE] POS Server ön-bağlantı başarısız (sorun değil): {e}", flush=True)
    
    class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    server = ThreadedHTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)
    print(f"[BRIDGE] HTTP sunucu başlatıldı: http://{BRIDGE_HOST}:{BRIDGE_PORT} (threaded)", flush=True)
    print(f"[BRIDGE] READY", flush=True)  # Electron'un dinleyeceği sinyal
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        close_connection()
        print("[BRIDGE] Sunucu kapatıldı.", flush=True)


if __name__ == '__main__':
    main()
