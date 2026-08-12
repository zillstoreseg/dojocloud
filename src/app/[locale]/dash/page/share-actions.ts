'use server';

import QRCode from 'qrcode';
import { requireTrainer } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { publicEnv } from '@/lib/env';

/**
 * Renders the coach's own page URL as a QR code, as an SVG data URI.
 *
 * Generated server-side and only for the caller's own username, so the route
 * cannot be turned into a general-purpose QR service for arbitrary URLs.
 */
export async function pageQrCode(locale: string): Promise<{ url: string; qr: string } | null> {
  try {
    const user = await requireTrainer();
    const profile = await prisma.trainerProfile.findUniqueOrThrow({
      where: { id: user.trainerId },
      select: { username: true },
    });

    const url = `${publicEnv.appUrl.replace(/\/$/, '')}/${locale}/c/${profile.username}`;

    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1F1A', light: '#FFFFFF' },
    });

    return { url, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  } catch {
    return null;
  }
}
