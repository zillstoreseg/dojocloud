import { z } from 'zod';
import type { BlockType } from '@prisma/client';
import { FLAG_KEYS } from './flags';

/**
 * The single source of truth for landing-page blocks.
 *
 * A block's props are stored as JSON, which means the database cannot enforce
 * their shape. Every read and every write therefore goes through the schema
 * here: `parseBlockProps` is total — it never throws and never returns
 * undefined — so a block saved by an older version of the builder, or edited
 * by hand, degrades to its defaults instead of crashing a public page.
 *
 * Adding a block type means adding one entry here and one renderer; nothing
 * else in the builder needs to know about it.
 */

const link = z.string().trim().max(500).optional().or(z.literal(''));
const text = (max: number) => z.string().trim().max(max);

export const blockSchemas = {
  HERO: z.object({
    headline: text(120),
    subheadline: text(300),
    ctaLabel: text(40),
    ctaHref: link,
    imageUrl: link,
    align: z.enum(['start', 'center']).catch('start'),
    showStats: z.boolean().catch(true),
  }),
  ABOUT: z.object({
    title: text(80),
    body: text(2000),
    imageUrl: link,
  }),
  STATS: z.object({
    title: text(80),
    items: z
      .array(z.object({ value: text(16), label: text(40) }))
      .max(6)
      .catch([]),
  }),
  SERVICES: z.object({
    title: text(80),
    items: z
      .array(z.object({ title: text(60), body: text(300), icon: text(30) }))
      .max(9)
      .catch([]),
  }),
  PACKAGES: z.object({
    title: text(80),
    subtitle: text(200),
    /** Empty means "every public package", so a new package appears by itself. */
    packageIds: z.array(z.string()).max(20).catch([]),
  }),
  CERTIFICATES: z.object({
    title: text(80),
    subtitle: text(200),
  }),
  TRANSFORMATIONS: z.object({
    title: text(80),
    subtitle: text(200),
  }),
  GALLERY: z.object({
    title: text(80),
    images: z.array(z.object({ url: text(500), caption: text(120) })).max(24).catch([]),
  }),
  VIDEO: z.object({
    title: text(80),
    url: text(500),
    caption: text(200),
  }),
  TESTIMONIALS: z.object({
    title: text(80),
    subtitle: text(200),
  }),
  FAQ: z.object({
    title: text(80),
    items: z.array(z.object({ q: text(200), a: text(1000) })).max(20).catch([]),
  }),
  CONTACT_FORM: z.object({
    title: text(80),
    subtitle: text(300),
    buttonLabel: text(40),
    askGoal: z.boolean().catch(true),
    successMessage: text(300),
  }),
  CTA_WHATSAPP: z.object({
    title: text(80),
    body: text(300),
    phone: text(30),
    buttonLabel: text(40),
    prefilledMessage: text(300),
  }),
  SOCIAL_LINKS: z.object({
    title: text(80),
  }),
  CUSTOM_HTML: z.object({
    html: z.string().max(20000),
  }),
} satisfies Record<BlockType, z.ZodTypeAny>;

export type BlockProps = {
  [K in BlockType]: z.infer<(typeof blockSchemas)[K]>;
};

export const BLOCK_DEFAULTS: { [K in BlockType]: BlockProps[K] } = {
  HERO: {
    headline: '',
    subheadline: '',
    ctaLabel: '',
    ctaHref: '',
    imageUrl: '',
    align: 'start',
    showStats: true,
  },
  ABOUT: { title: '', body: '', imageUrl: '' },
  STATS: { title: '', items: [] },
  SERVICES: { title: '', items: [] },
  PACKAGES: { title: '', subtitle: '', packageIds: [] },
  CERTIFICATES: { title: '', subtitle: '' },
  TRANSFORMATIONS: { title: '', subtitle: '' },
  GALLERY: { title: '', images: [] },
  VIDEO: { title: '', url: '', caption: '' },
  TESTIMONIALS: { title: '', subtitle: '' },
  FAQ: { title: '', items: [] },
  CONTACT_FORM: {
    title: '',
    subtitle: '',
    buttonLabel: '',
    askGoal: true,
    successMessage: '',
  },
  CTA_WHATSAPP: { title: '', body: '', phone: '', buttonLabel: '', prefilledMessage: '' },
  SOCIAL_LINKS: { title: '' },
  CUSTOM_HTML: { html: '' },
};

/**
 * Parses stored JSON into props for the given block type, filling anything
 * missing from the defaults. Never throws: a malformed block renders empty
 * rather than taking the whole page down.
 */
export function parseBlockProps<K extends BlockType>(type: K, raw: unknown): BlockProps[K] {
  const merged = { ...BLOCK_DEFAULTS[type], ...(raw && typeof raw === 'object' ? raw : {}) };
  const result = blockSchemas[type].safeParse(merged);
  return (result.success ? result.data : BLOCK_DEFAULTS[type]) as BlockProps[K];
}

/** Block types a trainer may add, in the order the library lists them. */
export const BLOCK_ORDER: BlockType[] = [
  'HERO',
  'ABOUT',
  'STATS',
  'SERVICES',
  'PACKAGES',
  'CERTIFICATES',
  'TRANSFORMATIONS',
  'GALLERY',
  'VIDEO',
  'TESTIMONIALS',
  'FAQ',
  'CONTACT_FORM',
  'CTA_WHATSAPP',
  'SOCIAL_LINKS',
  'CUSTOM_HTML',
];

export const BLOCK_LABELS: Record<BlockType, { ar: string; en: string }> = {
  HERO: { ar: 'الواجهة', en: 'Hero' },
  ABOUT: { ar: 'نبذة عني', en: 'About' },
  STATS: { ar: 'أرقام وإنجازات', en: 'Stats' },
  SERVICES: { ar: 'الخدمات', en: 'Services' },
  PACKAGES: { ar: 'الباقات', en: 'Packages' },
  CERTIFICATES: { ar: 'الشهادات', en: 'Certificates' },
  TRANSFORMATIONS: { ar: 'قبل وبعد', en: 'Transformations' },
  GALLERY: { ar: 'معرض الصور', en: 'Gallery' },
  VIDEO: { ar: 'فيديو', en: 'Video' },
  TESTIMONIALS: { ar: 'آراء المتدربين', en: 'Testimonials' },
  FAQ: { ar: 'أسئلة شائعة', en: 'FAQ' },
  CONTACT_FORM: { ar: 'نموذج تواصل', en: 'Contact form' },
  CTA_WHATSAPP: { ar: 'زر واتساب', en: 'WhatsApp button' },
  SOCIAL_LINKS: { ar: 'روابط السوشيال', en: 'Social links' },
  CUSTOM_HTML: { ar: 'HTML مخصص', en: 'Custom HTML' },
};

export const BLOCK_HINTS: Record<BlockType, { ar: string; en: string }> = {
  HERO: { ar: 'أول ما يشوفه الزائر: اسمك وجملة تبيعك وزر.', en: 'The first thing a visitor sees.' },
  ABOUT: { ar: 'قصتك ورحلتك في سطور.', en: 'Your story in a few lines.' },
  STATS: { ar: 'أرقام تبني ثقة: سنوات خبرة، متدربين، كيلوهات.', en: 'Numbers that build trust.' },
  SERVICES: { ar: 'إيه اللي بتقدمه بالظبط.', en: 'What exactly you offer.' },
  PACKAGES: { ar: 'باقاتك بأسعارها، مربوطة تلقائيًا بصفحة الاشتراك.', en: 'Your packages and prices.' },
  CERTIFICATES: { ar: 'شهاداتك المعتمدة من الإدارة.', en: 'Your approved certificates.' },
  TRANSFORMATIONS: { ar: 'نتائج متدربينك قبل وبعد.', en: 'Before-and-after results.' },
  GALLERY: { ar: 'صور من شغلك.', en: 'Photos of your work.' },
  VIDEO: { ar: 'فيديو تعريفي من يوتيوب أو رابط مباشر.', en: 'An intro video.' },
  TESTIMONIALS: { ar: 'كلام متدربينك عنك.', en: 'What your trainees say.' },
  FAQ: { ar: 'أسئلة بتتسأل كتير، ردودها هنا.', en: 'Questions you get a lot.' },
  CONTACT_FORM: { ar: 'كل من يملأه يوصلك كعميل محتمل.', en: 'Every submission becomes a lead.' },
  CTA_WHATSAPP: { ar: 'زر يفتح محادثة واتساب برسالة جاهزة.', en: 'Opens WhatsApp with a message.' },
  SOCIAL_LINKS: { ar: 'حساباتك على السوشيال.', en: 'Your social accounts.' },
  CUSTOM_HTML: { ar: 'كود HTML خاص بك — لخطة Elite.', en: 'Your own HTML — Elite plan.' },
};

/** Blocks that only make sense once on a page. */
export const SINGLETON_BLOCKS: ReadonlySet<BlockType> = new Set([
  'HERO',
  'ABOUT',
  'CERTIFICATES',
  'TRANSFORMATIONS',
  'TESTIMONIALS',
  'CONTACT_FORM',
  'SOCIAL_LINKS',
]);

/** Gated behind `builder.custom_html`, which only the top plan turns on. */
export const FLAGGED_BLOCKS: Partial<Record<BlockType, string>> = {
  CUSTOM_HTML: FLAG_KEYS.BUILDER_CUSTOM_HTML,
};

// ─────────────────────────────────────────────────────────────── theme ──

export const pageThemeSchema = z.object({
  primary: z.string().trim().max(32).catch(''),
  mode: z.enum(['light', 'dark']).catch('light'),
  font: z.enum(['display', 'sans']).catch('display'),
  radius: z.enum(['sharp', 'soft', 'round']).catch('soft'),
});

export type PageTheme = z.infer<typeof pageThemeSchema>;

export const DEFAULT_THEME: PageTheme = {
  primary: '',
  mode: 'light',
  font: 'display',
  radius: 'soft',
};

export function parseTheme(raw: unknown): PageTheme {
  const result = pageThemeSchema.safeParse({ ...DEFAULT_THEME, ...(raw as object) });
  return result.success ? result.data : DEFAULT_THEME;
}

/** Radius token per theme choice, applied as a CSS variable on the page root. */
export const THEME_RADIUS: Record<PageTheme['radius'], string> = {
  sharp: '0.25rem',
  soft: '1.125rem',
  round: '2rem',
};

/**
 * The starter page a trainer gets on first open. A blank canvas is a worse
 * first run than a page that already says something true about them.
 */
export function starterBlocks(input: {
  fullName: string;
  yearsExperience: number;
  isAr: boolean;
}): { type: BlockType; props: Record<string, unknown> }[] {
  const { fullName, yearsExperience, isAr } = input;
  return [
    {
      type: 'HERO',
      props: {
        ...BLOCK_DEFAULTS.HERO,
        headline: isAr ? `دربني: ${fullName}` : `Train with ${fullName}`,
        subheadline: isAr
          ? 'برنامج تدريب وتغذية مفصّل على هدفك، ومتابعة أسبوعية.'
          : 'A training and nutrition plan built around your goal, followed up weekly.',
        ctaLabel: isAr ? 'ابدأ معايا' : 'Start with me',
      },
    },
    {
      type: 'ABOUT',
      props: {
        ...BLOCK_DEFAULTS.ABOUT,
        title: isAr ? 'نبذة عني' : 'About me',
        body: isAr
          ? `${yearsExperience} سنوات في تدريب الناس على اختلاف مستوياتهم. اكتب هنا قصتك وإيه اللي بيميّزك.`
          : `${yearsExperience} years coaching people at every level. Write your story here.`,
      },
    },
    { type: 'PACKAGES', props: { ...BLOCK_DEFAULTS.PACKAGES, title: isAr ? 'الباقات' : 'Packages' } },
    {
      type: 'CONTACT_FORM',
      props: {
        ...BLOCK_DEFAULTS.CONTACT_FORM,
        title: isAr ? 'ابعتلي' : 'Get in touch',
        subtitle: isAr ? 'سيب رقمك وهتواصل معاك.' : 'Leave your number and I will reach out.',
        buttonLabel: isAr ? 'ابعت' : 'Send',
        successMessage: isAr ? 'وصلني، هتواصل معاك قريب.' : 'Got it — I will be in touch soon.',
      },
    },
  ];
}
