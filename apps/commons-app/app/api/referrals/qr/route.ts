import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { GET as referralSummary } from '../route';

export async function GET() {
  const summary = await referralSummary();
  if (!summary.ok) return summary;
  const { data } = await summary.json();
  const image = await QRCode.toBuffer(data.url, { type: 'png', width: 464, margin: 3, errorCorrectionLevel: 'M' });
  return new NextResponse(new Uint8Array(image), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}
