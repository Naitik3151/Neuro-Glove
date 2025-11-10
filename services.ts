import { GoogleGenAI } from '@google/genai';
import { UI_STRINGS, UIStrings } from './translations';

// FIX: Export UI_STRINGS and UIStrings so they can be imported by components.
export { UI_STRINGS };
export type { UIStrings };

// --- Configuration ---
// API Keys are managed in the .env.local file.
// - API_KEY: For Gemini AI features.
// - GMAP_API_KEY: For Google Maps features.

// --- Consolidated Types ---
export interface DoctorInfo { name: string; phone: string; types: string; lat: number; lon: number; distKm: number; }
export interface LogEntry { timestamp: Date; text: string; direction: 'in' | 'out'; }
export enum ConnectionType { Disconnected, Bluetooth, Serial }

// --- AI Service Logic ---
export async function analyzeLogsWithGemini(logs: LogEntry[]): Promise<string> {
  if (!process.env.API_KEY) throw new Error("API_KEY not set for AI features.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const formattedLogs = logs.map(log => `${log.timestamp.toLocaleTimeString()} ${log.direction === 'in' ? '<--' : '-->'} ${log.text}`).join('\n');
  const prompt = `You are an expert assistant for a 'Neuro Glove' device.
Analyze the following session log. Provide a concise summary, identify patterns or issues, and offer suggestions. Format your response clearly using markdown.
Session Log:\n---\n${formattedLogs}\n---\nYour Analysis:`;
  try {
    const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { thinkingConfig: { thinkingBudget: 32768 } } });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return `Error during analysis: ${errorMessage}`;
  }
}

// --- Translation Service Logic ---
const translationCache = new Map<string, string>();
let translationAi: GoogleGenAI | null = null;
function getTranslationAi() {
    if (!translationAi) {
        if (!process.env.API_KEY) { console.warn("API_KEY not set, translation will not work."); return null; }
        translationAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return translationAi;
}
export async function translateText(text: string, targetLang: string): Promise<string> {
    if (targetLang === 'en') return text;
    const cacheKey = `en:${targetLang}:${text}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;
    const genAI = getTranslationAi();
    if (!genAI) throw new Error("Gemini AI not initialized. Check API_KEY.");
    const targetLanguageName = new Intl.DisplayNames([targetLang], { type: 'language' }).of(targetLang) || targetLang;
    const prompt = `Translate the following English text to ${targetLanguageName}. Provide ONLY the translated text, without any comments or quotes. Text to translate: "${text}"`;
    try {
        const response = await genAI.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const translation = response.text.trim();
        translationCache.set(cacheKey, translation);
        return translation;
    } catch (error) {
        console.error("Error translating with Gemini:", error);
        throw new Error("Failed to translate text via AI.");
    }
}

export function getUIStrings(langCode: string): UIStrings { return UI_STRINGS[langCode] || UI_STRINGS.en; }

// --- Log Service Logic ---
function getLogKey(date: Date): string { return `ng_logs_${date.toISOString().slice(0, 10)}`; }
export function saveLog(log: LogEntry): void {
    const key = getLogKey(log.timestamp);
    try {
        const logs: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        const ts = log.timestamp;
        const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
        logs.push(`${time} ${log.direction === 'in' ? 'IN' : 'OUT'} ${log.text}`);
        localStorage.setItem(key, JSON.stringify(logs));
    } catch (error) { console.error("Failed to save log:", error); }
}
export async function loadLogsForDate(date: Date): Promise<LogEntry[]> {
    try {
        const logLines: string[] = JSON.parse(localStorage.getItem(getLogKey(date)) || '[]');
        return logLines.map(line => {
            const inIndex = line.indexOf(' IN '), outIndex = line.indexOf(' OUT ');
            if (inIndex === -1 && outIndex === -1) return null;
            const idx = inIndex > -1 ? inIndex : outIndex, dir = inIndex > -1 ? 'in' : 'out';
            const timeStr = line.substring(0, idx).trim(), text = line.substring(idx + (dir === 'in' ? 4 : 5));
            const ts = new Date(`${date.toISOString().slice(0, 10)} ${timeStr}`);
            return isNaN(ts.getTime()) ? null : { timestamp: ts, direction: dir, text };
        }).filter((log): log is LogEntry => log !== null);
    } catch (error) { console.error("Failed to load logs:", error); return []; }
}

// --- Location Service Logic ---
let gmapsLoaded = false, gmapsLoading = false;
let gmapsPromise: Promise<boolean> | null = null;
function loadGoogleMaps(): Promise<boolean> {
    if (gmapsLoaded) return Promise.resolve(true);
    if (gmapsLoading && gmapsPromise) return gmapsPromise;
    gmapsLoading = true;
    gmapsPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.GMAP_API_KEY}&libraries=places&callback=__gmapInit`;
        script.async = true; (window as any).__gmapInit = () => { gmapsLoaded = true; gmapsLoading = false; resolve(true); };
        script.onerror = () => { console.warn('Failed to load Google Maps'); gmapsLoading = false; resolve(false); };
        document.head.appendChild(script);
    });
    return gmapsPromise;
}
function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocation is not supported.'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
    });
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (v: number) => v * Math.PI / 180, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function formatDistance(dKm: number): string { return isNaN(dKm) ? '--' : dKm < 1 ? `${Math.round(dKm * 1000)} m` : `${dKm.toFixed(2)} km`; }
export async function findNearbyDoctors(appendLog: (text: string, dir: 'in' | 'out') => void): Promise<DoctorInfo | null> {
    if (!process.env.GMAP_API_KEY || process.env.GMAP_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
      throw new Error('Please configure the Google Maps API Key in the .env.local file.');
    }
    const { coords: { latitude: lat, longitude: lon } } = await getCurrentPosition();
    if (!await loadGoogleMaps()) {
        appendLog('Google Maps API key failed, using fallback.', 'in'); openMapsSearch('doctors', lat, lon);
        throw new Error('Google Maps API not available.');
    }
    const service = new (window as any).google.maps.places.PlacesService(document.createElement('div'));
    return new Promise((resolve, reject) => {
        service.nearbySearch({ location: new (window as any).google.maps.LatLng(lat, lon), radius: 1000, type: 'doctor' }, (r: any[], s: any) => {
            if (s !== (window as any).google.maps.places.PlacesServiceStatus.OK || !r || r.length === 0) return reject(new Error('No nearby doctors found.'));
            const closest = r.map(p => ({ ...p, dist: haversine(lat, lon, p.geometry?.location?.lat() || 0, p.geometry?.location?.lng() || 0) })).sort((a, b) => a.dist - b.dist)[0];
            if (!closest?.place_id) return reject(new Error('No valid doctors found.'));
            service.getDetails({ placeId: closest.place_id, fields: ['name', 'formatted_phone_number', 'types', 'geometry'] }, (pd: any, st2: any) => {
                if (st2 !== (window as any).google.maps.places.PlacesServiceStatus.OK || !pd) return reject(new Error('Failed to get doctor details.'));
                resolve({ name: pd.name || 'Doctor', phone: pd.formatted_phone_number || '', types: pd.types?.join(', ') || 'Health', lat: pd.geometry?.location?.lat() || 0, lon: pd.geometry?.location?.lng() || 0, distKm: closest.dist });
            });
        });
    });
}
export async function findNearbyHospitals(appendLog: (text: string, dir: 'in' | 'out') => void): Promise<void> {
    const { coords: { latitude, longitude } } = await getCurrentPosition();
    appendLog('Location acquired. Opening maps for hospitals.', 'in'); openMapsSearch('hospitals', latitude, longitude);
}
export function openMapsSearch(query: string, lat: number, lon: number): void {
  const url = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? `maps://maps.apple.com/?q=${encodeURIComponent(query)}&ll=${lat},${lon}` : `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lon},14z`;
  window.open(url, '_blank');
}
export function openMapsDirections(lat: number, lon: number, label: string): void {
  const url = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? `maps://maps.apple.com/?daddr=${lat},${lon}&q=${encodeURIComponent(label)}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  window.open(url, '_blank');
}

// --- Device Service Logic ---
// FIX: Removed custom Web Bluetooth API type definitions to use standard browser types and avoid conflicts.
// FIX: Add bluetooth to Navigator interface and use 'any' for Web Bluetooth types to resolve compilation errors.
declare global { interface Navigator { serial: any; bluetooth: any; } }
interface SerialPort { open(options: { baudRate: number }): Promise<void>; close(): Promise<void>; readonly readable: ReadableStream<Uint8Array>; readonly writable: WritableStream<Uint8Array>; getInfo(): { usbVendorId?: number, usbProductId?: number }; }
let device: any | null, gattServer: any | null, txChar: any | null, rxChar: any | null;
let btReceiveBuffer = '', port: SerialPort | null, reader: ReadableStreamDefaultReader<Uint8Array> | null, keepReading = false;
let log: (text: string, dir: 'in' | 'out') => void = () => {};
let connChange: (conn: ConnectionType, d: Record<string, any> | null) => void = () => {};
export function init(onLog: (t: string, d: 'in' | 'out') => void, onConn: (c: ConnectionType, d: Record<string, any> | null) => void) { log = onLog; connChange = onConn; }
function getFakeRssi(): number { return Math.floor(Math.random() * 61) - 90; }
export function refreshBluetoothRssi() { if (device && gattServer?.connected) { connChange(ConnectionType.Bluetooth, { rssi: getFakeRssi() }); log('Refreshed BT signal', 'out'); } }
const UART_SERVICES = {
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e': { tx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', rx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
    '0000ffe0-0000-1000-8000-00805f9b34fb': { tx: '0000ffe1-0000-1000-8000-00805f9b34fb', rx: '0000ffe1-0000-1000-8000-00805f9b34fb' }
};
export async function connectBluetooth() {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available.');
  try {
    log('Requesting BT device...', 'out');
    device = await navigator.bluetooth.requestDevice({
        filters: [
            { services: Object.keys(UART_SERVICES) },
            { namePrefix: 'Neuro' }, { namePrefix: 'HM-' }, { namePrefix: 'JDY-' }, { namePrefix: 'AT-09' }, { name: 'DSD TECH' }, { name: 'MLT-BT05' },
        ],
        optionalServices: Object.keys(UART_SERVICES)
    });
    log(`Selected: ${device.name || 'Unknown'}`, 'in');
    if (!device.gatt) throw new Error('GATT Server not available.');
    device.addEventListener('gattserverdisconnected', onGattDisconnected);
    gattServer = await device.gatt.connect(); log('GATT connected', 'in');
    for (const sId in UART_SERVICES) {
        try {
            const service = await gattServer.getPrimaryService(sId);
            const chars = (UART_SERVICES as Record<string, {tx: string, rx: string}>)[sId];
            txChar = await service.getCharacteristic(chars.tx); rxChar = await service.getCharacteristic(chars.rx);
            log(`Using service: ${sId.split('-')[0]}...`, 'in');
            await txChar.startNotifications(); txChar.addEventListener('characteristicvaluechanged', onBtRx);
            log('Connected to device', 'in'); connChange(ConnectionType.Bluetooth, { rssi: getFakeRssi() }); return;
        } catch (e) { continue; }
    }
    throw new Error('Incompatible device: Required UART service not found.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('User cancelled')) log(`Bluetooth error: ${msg}`, 'in');
    disconnect(); throw error;
  }
}
function onBtRx(event: Event) {
  // FIX: Cast event.target to 'any' to access the 'value' property without full Web Bluetooth types.
  const v = (event.target as any).value;
  if (v) {
    btReceiveBuffer += new TextDecoder().decode(v);
    const parts = btReceiveBuffer.split(/\r?\n/);
    btReceiveBuffer = parts.pop() || '';
    parts.forEach(p => { if (p.trim()) log(p.trim(), 'in'); });
  }
}
function onGattDisconnected() { log('Bluetooth disconnected', 'in'); disconnect(); }
export async function connectSerial() {
    if (!('serial' in navigator)) throw new Error('Web Serial not supported.');
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        log('Serial port opened', 'in'); connChange(ConnectionType.Serial, { baudRate: 115200, ...port.getInfo() });
        keepReading = true; readSerialLoop();
    } catch (error) { log(`Serial error: ${error instanceof Error ? error.message : error}`, 'in'); disconnect(); throw error; }
}
async function readSerialLoop() {
    while (port?.readable && keepReading) {
        reader = port.readable.getReader();
        try {
            let buf = '';
            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                if (value) {
                    buf += new TextDecoder().decode(value); const p = buf.split(/\r?\n/); buf = p.pop() || '';
                    p.forEach(l => { if (l.trim()) log(l.trim(), 'in'); });
                }
            }
        } catch (e) { if (!(e instanceof Error && e.message.includes('canceled'))) log(`Serial read error: ${e}`, 'in');
        } finally { if (reader) { reader.releaseLock(); reader = null; } }
    }
}
export async function sendMessage(text: string) {
    const msg = text + '\n';
    if (rxChar && gattServer?.connected) {
        try { await rxChar.writeValue(new TextEncoder().encode(msg)); log(`Sent: ${text}`, 'out'); }
        catch (e) { log(`BT write error: ${e instanceof Error ? e.message : e}`, 'in'); }
    } else if (port?.writable) {
        const writer = port.writable.getWriter();
        try { await writer.write(new TextEncoder().encode(msg)); log(`Sent: ${text}`, 'out'); }
        catch (e) { log(`Serial write error: ${e instanceof Error ? e.message : e}`, 'in'); }
        finally { writer.releaseLock(); }
    } else { log('No device connected', 'out'); }
}
export function disconnect() {
  if (device) device.removeEventListener('gattserverdisconnected', onGattDisconnected);
  if (txChar) { txChar.removeEventListener('characteristicvaluechanged', onBtRx); txChar.stopNotifications().catch(()=>{}); }
  if (gattServer?.connected) gattServer.disconnect();
  keepReading = false; if (reader) reader.cancel().catch(()=>{}); if (port) port.close().catch(()=>{});
  device = gattServer = txChar = rxChar = port = reader = null; btReceiveBuffer = '';
  connChange(ConnectionType.Disconnected, null);
}