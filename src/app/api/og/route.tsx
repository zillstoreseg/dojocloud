import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';
import { specialtyLabel } from '@/lib/specialties';
import { countryLabel } from '@/lib/countries';
import { getBrand } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * The card a coach's link becomes when it is pasted into WhatsApp, Instagram
 * or X. Generated rather than uploaded, so every coach gets a consistent,
 * on-brand card without having to design one — and it stays correct when they
 * rename themselves or add a specialty.
 */

const SIZE = { width: 1200, height: 630 };

/**
 * Satori has no font of its own that can shape Arabic, and the one bundled
 * with `next/og` covers Latin only — an Arabic name renders as blank boxes, or
 * fails outright on fonts whose substitution tables it cannot read. Noto Sans
 * Arabic is checked into the repo for exactly this: it shapes Arabic, carries
 * Latin, and parses cleanly.
 *
 * Read once per process rather than per request.
 */
let fontCache:
  | { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[]
  | null = null;

async function fonts() {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), 'src', 'fonts');
  const [regular, bold] = await Promise.all([
    readFile(join(dir, 'NotoSansArabic-Regular.ttf')),
    readFile(join(dir, 'NotoSansArabic-Bold.ttf')),
  ]);
  // A Node Buffer is a view into a pooled ArrayBuffer, so handing it straight
  // to satori makes it read past the font and fail on the neighbouring bytes.
  // Copying to a standalone ArrayBuffer is what makes this work at all.
  const detach = (buf: Buffer) => new Uint8Array(buf).buffer as ArrayBuffer;
  fontCache = [
    { name: 'Noto Sans Arabic', data: detach(regular), weight: 400, style: 'normal' },
    { name: 'Noto Sans Arabic', data: detach(bold), weight: 700, style: 'normal' },
  ];
  return fontCache;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('u');
  const locale = searchParams.get('locale') === 'en' ? 'en' : 'ar';
  const isAr = locale === 'ar';

  const brand = await getBrand().catch(() => ({ name: 'CoachMate' }));
  const fontList = await fonts();

  const trainer = username
    ? await prisma.trainerProfile.findFirst({
        where: { username: username.toLowerCase(), approvalStatus: 'APPROVED' },
        select: {
          fullName: true,
          specialties: true,
          country: true,
          yearsExperience: true,
          avatarUrl: true,
          _count: { select: { trainees: { where: { status: 'ACTIVE' } } } },
        },
      })
    : null;

  if (!trainer) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8F6F1',
            color: '#0B1F1A',
            fontFamily: 'Noto Sans Arabic',
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {brand.name}
        </div>
      ),
      { ...SIZE, fonts: fontList },
    );
  }

  // Satori measures text nodes by code point and cannot take a number child,
  // so every value interpolated below is a string before it gets here.
  //
  // The specialties are separate nodes rather than one joined string: a neutral
  // separator sitting between two Arabic runs makes satori's bidi pass produce
  // an empty segment and throw. Laying them out with flex gap sidesteps the
  // mixed run and reads better anyway.
  const specialties = trainer.specialties.slice(0, 3).map((s) => specialtyLabel(s, locale));

  // Satori lays flex children out left-to-right and ignores `direction`, so RTL
  // is expressed the only way it understands: reverse the rows and hang the
  // column off the far edge.
  const row = (isAr ? 'row-reverse' : 'row') as 'row' | 'row-reverse';
  const edge = (isAr ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #F8F6F1 0%, #EFEAE0 100%)',
          color: '#0B1F1A',
          fontFamily: 'Noto Sans Arabic',
          alignItems: edge,
        }}
      >
        {/* Brand mark */}
        <div
          style={{ display: 'flex', flexDirection: row, alignItems: 'center', gap: 14, fontSize: 30 }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              border: '5px solid #0F7A5E',
              borderRightColor: 'transparent',
            }}
          />
          <span style={{ fontWeight: 700, color: '#0F7A5E' }}>{brand.name}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: row, alignItems: 'center', gap: 44, width: '100%' }}>
          {trainer.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trainer.avatarUrl}
              alt=""
              width={260}
              height={260}
              style={{ borderRadius: 84, objectFit: 'cover' }}
            />
          ) : null}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, alignItems: edge }}
          >
            <div style={{ fontSize: 30, color: '#0F7A5E', fontWeight: 600 }}>
              {isAr ? 'مدرب معتمد' : 'Verified coach'}
            </div>
            <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
              {trainer.fullName}
            </div>
            {specialties.length ? (
              <div
                style={{ display: 'flex', flexDirection: row, gap: 20, fontSize: 34, color: '#5C6B66' }}
              >
                {specialties.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: row, gap: 56, fontSize: 28, color: '#5C6B66' }}>
          <div style={{ display: 'flex', flexDirection: row, gap: 10 }}>
            <span style={{ color: '#0B1F1A', fontWeight: 700 }}>{String(trainer.yearsExperience)}</span>
            <span>{isAr ? 'سنوات خبرة' : 'years'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: row, gap: 10 }}>
            <span style={{ color: '#0B1F1A', fontWeight: 700 }}>{String(trainer._count.trainees)}</span>
            <span>{isAr ? 'متدرب' : 'trainees'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: row, gap: 10 }}>
            <span>{countryLabel(trainer.country, locale)}</span>
          </div>
        </div>
      </div>
    ),
    { ...SIZE, fonts: fontList },
  );
}
