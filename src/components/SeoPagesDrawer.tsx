import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Calendar,
  Flame,
  Gamepad2,
  Share2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  HelpCircle,
} from 'lucide-react';

export type SeoPageSlug =
  | '/'
  | '/diwali-2026-date'
  | '/light-a-diya-online'
  | '/diwali-mela-games'
  | '/diwali-wishes'
  | '/hindi'
  | '404';

const VALID_SLUGS: SeoPageSlug[] = [
  '/',
  '/diwali-2026-date',
  '/light-a-diya-online',
  '/diwali-mela-games',
  '/diwali-wishes',
  '/hindi',
];

export function resolveInitialSeoSlug(): { slug: SeoPageSlug; openByDefault: boolean } {
  if (typeof window === 'undefined') return { slug: '/', openByDefault: false };
  const rawPath = window.location.pathname.replace(/\.html$/i, '').replace(/\/+$/, '') || '/';
  if (rawPath === '/' || rawPath === '/index') {
    return { slug: '/', openByDefault: false };
  }
  if ((VALID_SLUGS as string[]).includes(rawPath)) {
    return { slug: rawPath as SeoPageSlug, openByDefault: true };
  }
  return { slug: '404', openByDefault: true };
}

interface PageMetaSpec {
  title: string;
  description: string;
  label: string;
}

export const SEO_PAGE_META: Record<SeoPageSlug, PageMetaSpec> = {
  '/': {
    title: 'Diwali Mela Online — Mela Chaloge Mere Sath?',
    description:
      "India's virtual Diwali mela in your browser! Roam the mela, play games, visit stalls, light patakhe & diyas with friends. Free, no download. Diwali 2026.",
    label: 'Mela Guide & FAQ',
  },
  '/diwali-2026-date': {
    title: 'Diwali 2026 Date, Muhurat & 5-Day Festival Calendar | Diwali Mela Online',
    description:
      'When is Diwali 2026? View the complete 5-day Diwali 2026 calendar (6 Nov Dhanteras to 10 Nov Bhai Dooj), Sunday 8 November 2026 Lakshmi Puja Muhurat, and celebrate online.',
    label: 'Diwali 2026 Date',
  },
  '/light-a-diya-online': {
    title: 'Light a Diya Online — Virtual Deepotsav 2026 | Diwali Mela Online',
    description:
      'Light a diya online at the 3D Deepotsav Mandap! Tap 7 earthen clay diyas, offer a Sankalp blessing for your family, and share your glowing Diwali lamp with friends.',
    label: 'Light a Diya Online',
  },
  '/diwali-mela-games': {
    title: 'Diwali Game Online Free — 3D Mela Games & Rides | Diwali Mela Online',
    description:
      'Play free 3D Diwali mela games in your browser! Enjoy Balloon Shooting, Golden Ring Toss, interactive 3D Floor Rangoli Art, Maut Ka Kuan, and the Giant Ferris Wheel.',
    label: 'Diwali Mela Games',
  },
  '/diwali-wishes': {
    title: 'Happy Diwali 2026 Wishes, Shayari & WhatsApp Invites | Diwali Mela Online',
    description:
      'Celebrate Diwali online with friends! Copy and share the best Happy Diwali 2026 wishes, heartfelt Hindi shayari, and virtual mela invitations on WhatsApp.',
    label: 'Diwali Wishes 2026',
  },
  '/hindi': {
    title: 'दीवाली मेला ऑनलाइन 2026 — घर बैठे 3D दिवाली मेला खेलें (Diwali Mela Online Khele)',
    description:
      'दीवाली मेला ऑनलाइन खेलें! बिना किसी डाउनलोड के अपने मोबाइल और कंप्यूटर पर 3D दिवाली मेला घूमें, 7 दीये जलाएं, रंगोली सजाएं, गुब्बारे फोड़ें और झूला झूलें।',
    label: 'हिंदी गाइड (Hindi)',
  },
  '404': {
    title: 'Page Not Found — Return to Diwali Mela Online',
    description:
      "Looks like you wandered outside the fairground gates! Head back into India's 3D Virtual Diwali Mela Online.",
    label: '404 Not Found',
  },
};

const DIWALI_WISHES_COLLECTION = [
  {
    category: 'Heartfelt Hinglish Invitation',
    text: 'Iss baar bheed aur dhuein se door, ek pyari si digital roshni wali shaam! ✨ Mere sath 3D Diwali Mela chaloge? Garam jalebi, 7 diyas mandap, giant wheel aur 1008 sky lanterns tera intezaar kar rahe hain! Shubh Deepavali 2026 🪔❤️',
  },
  {
    category: 'Traditional Hindi Shayari',
    text: 'दीपों का यह पावन त्योहार, आपके जीवन में लाए खुशियां हज़ार। माँ लक्ष्मी विराजें आपके द्वार, हमारी तरफ से शुभ दीपावली का प्यार! 🪔✨ आओ साथ मिलकर दीवाली मेला ऑनलाइन घूमें!',
  },
  {
    category: 'Warm English Family Blessing',
    text: 'May the golden glow of a thousand earthen diyas fill your home with peace, good health, and endless laughter. Wishing you and your family a very Happy Diwali 2026! Come walk through our virtual 3D Diwali Mela tonight!',
  },
  {
    category: 'Nostalgic Bachpan Special',
    text: 'Yaad hai bachpan wali Diwali? Haath mein chamakti phuljhari, kulhad wali chai, hawa-mithai aur mele ka bada jhoola! 🎡 Wohi bachpan phir se jeene ke liye aao mere sath Diwali Mela Online mein!',
  },
  {
    category: 'Seva & Kindness Diwali Wish',
    text: 'Apne ghar ke diye toh har koi jalata hai, asli Diwali toh tab hai jab kisi zarooratmand ke chehre par muskaan aati hai. Wishing you a blessed, compassionate, and luminous Deepavali 2026! 🪔🙏',
  },
  {
    category: 'Short WhatsApp Status Wish',
    text: 'Roshni, rangoli, mithai aur bachpan ki yaadein! ✨ Happy Diwali 2026! Join me inside the free 3D Virtual Diwali Mela in your browser:',
  },
];

interface SeoPagesDrawerProps {
  activeSlug: SeoPageSlug;
  isOpen: boolean;
  onClose: () => void;
  onNavigateSlug: (slug: SeoPageSlug, openDrawer?: boolean) => void;
  onEnter3DAttraction: (attractionId?: string) => void;
  onOpenDaanPeti: () => void;
  onToast: (msg: string) => void;
  communityDiyas: number;
}

export const SeoPagesDrawer: React.FC<SeoPagesDrawerProps> = ({
  activeSlug,
  isOpen,
  onClose,
  onNavigateSlug,
  onEnter3DAttraction,
  onOpenDaanPeti,
  onToast,
  communityDiyas,
}) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Sync <title>, <meta name="description">, OpenGraph tags & <link rel="canonical"> with active route
  useEffect(() => {
    const meta = SEO_PAGE_META[activeSlug] || SEO_PAGE_META['/'];
    document.title = meta.title;

    const setMetaContent = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };

    setMetaContent('meta[name="description"]', meta.description);
    setMetaContent('meta[property="og:title"]', meta.title);
    setMetaContent('meta[property="og:description"]', meta.description);
    setMetaContent('meta[name="twitter:title"]', meta.title);
    setMetaContent('meta[name="twitter:description"]', meta.description);

    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : 'https://diwali-mela-online.vercel.app';
    const cleanPath = activeSlug === '404' ? '/' : activeSlug;
    const fullUrl = `${origin}${cleanPath}`;

    setMetaContent('meta[property="og:url"]', fullUrl);
    const canonical = document.getElementById('canonical-link');
    if (canonical) {
      canonical.setAttribute('href', fullUrl);
    }
  }, [activeSlug]);

  const getShareSiteUrl = () => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return 'https://diwali-mela-online.vercel.app';
  };

  const handleCopyWish = (wishText: string, idx: number) => {
    const fullMessage = `${wishText}\n\n🪔 Play & Roam Diwali Mela Online: ${getShareSiteUrl()}`;
    navigator.clipboard.writeText(fullMessage).then(() => {
      setCopiedIdx(idx);
      onToast('Copied Diwali Wish + Mela Link! Ready to paste on WhatsApp.');
      setTimeout(() => setCopiedIdx(null), 2500);
    });
  };

  const handleWhatsAppShare = (wishText: string) => {
    const fullMessage = `${wishText}\n\n🪔 Enter the 3D Diwali Mela Online (Free, No Download): ${getShareSiteUrl()}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullMessage)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={
        isOpen
          ? 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#070b14]/90 pointer-events-auto'
          : 'sr-only'
      }
      role={isOpen ? 'dialog' : 'region'}
      aria-modal={isOpen ? 'true' : undefined}
      aria-label={SEO_PAGE_META[activeSlug]?.title || 'Diwali Mela Online Guide & FAQ'}
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-[#11192b] border-2 border-[#f1aa49]/55 text-[#f7e7c4] shadow-2xl overflow-hidden">
        {/* Top Navigation Header with Internal Links to All 6 SEO Pages */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#0b101d] border-b border-[#f1aa49]/30">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { slug: '/', icon: BookOpen, label: 'Mela Guide & FAQ' },
                { slug: '/diwali-2026-date', icon: Calendar, label: 'Diwali 2026 Date' },
                { slug: '/light-a-diya-online', icon: Flame, label: 'Light a Diya Online' },
                { slug: '/diwali-mela-games', icon: Gamepad2, label: 'Mela Games' },
                { slug: '/diwali-wishes', icon: Share2, label: 'Diwali Wishes' },
                { slug: '/hindi', icon: Globe, label: 'हिंदी गाइड' },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeSlug === tab.slug;
              return (
                <a
                  key={tab.slug}
                  href={tab.slug}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug(tab.slug, true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#f1aa49] text-[#121726]'
                      : 'bg-[#152038] text-[#d8c39e] hover:text-[#fff5de] hover:bg-[#1d2c4d]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEnter3DAttraction();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-bold hover:bg-[#ffbe61] transition-colors cursor-pointer"
            >
              Enter 3D Mela →
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Semantic Article Body */}
        <article className="p-6 sm:p-8 overflow-y-auto space-y-8 leading-relaxed text-sm text-[#e6d5b8]">
          {/* PAGE 1: HOMEPAGE SEO GUIDE & FAQ (/) — 650+ words, H1/H2 hierarchy, Command 4, 5, 6 */}
          {activeSlug === '/' && (
            <div className="space-y-7">
              <header className="space-y-3 border-b border-[#f1aa49]/25 pb-5">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  ABOUT DIWALI MELA ONLINE · FREE 3D BROWSER EXPERIENCE
                </div>
                <h1 className="text-2xl sm:text-4xl font-display font-bold text-[#fff5de]">
                  Diwali Mela Online — Virtual Diwali Mela 2026
                </h1>
                {/* First 100 words containing: diwali mela online, free, 3D, Diwali 2026, no download */}
                <p className="text-sm sm:text-base text-[#f3e3c6] leading-relaxed">
                  Welcome to <strong>Diwali Mela Online</strong>, India&apos;s interactive{' '}
                  <strong>3D</strong> nighttime festive fairground created for{' '}
                  <strong>Diwali 2026</strong>. Built to run directly in your mobile or desktop browser
                  with <strong>no download</strong> required, this <strong>free</strong> virtual Diwali
                  mela invites you, your friends, and your family to walk through glowing lantern-lit
                  bazaar lanes, play nostalgic Indian fair games, paint floor rangoli, light earthen
                  diyas, burst eco-friendly patakhe, and watch 1,008 Akashdeep sky lanterns rise into
                  the starry night sky.
                </p>
              </header>

              {/* Featured Image with Natural Keyword Alt Text */}
              <figure className="rounded-2xl overflow-hidden border border-[#f1aa49]/35 bg-[#0b101d]">
                <img
                  src="/og-image.jpg"
                  alt="virtual diwali mela ferris wheel at night with glowing earthen diyas and sky lanterns"
                  className="w-full h-auto max-h-72 object-cover block"
                  loading="lazy"
                />
                <figcaption className="px-4 py-2 text-xs text-[#b8a17d] text-center">
                  Roam the illuminated 3D Diwali Mela fairgrounds, ride the Chand Wala Jhoola (Giant Wheel), and light diyas at the Deepotsav Mandap.
                </figcaption>
              </figure>

              {/* H2 Section 1: What Diwali Mela Online Is & Full Games List */}
              <section className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#fff5de]">
                  What is Diwali Mela Online &amp; Full List of 3D Mela Games
                </h2>
                <p>
                  Remember childhood Diwali evenings when the entire neighborhood dressed up and walked
                  under marigold torans to the town fairground? <strong>Diwali Mela Online</strong>{' '}
                  brings that nostalgic community celebration into a real-time 3D browser world so
                  families, college hostel friends, and loved ones living across different cities can
                  celebrate together. Every game and ride inside our <strong>online Diwali mela game</strong>{' '}
                  is 100% free:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      1. Nishana Lagao · Balloon Shooting Stall
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Step up to the colorful wooden target board and pop moving balloons with 3 free shots per round to win the virtual Diwali Teddy Prize for your Mela Jhola.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      2. Swarna Challa · Golden Ring Toss
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Toss 5 spinning golden rings onto traditional Diwali prize pedestals in 3D space to win the Swarna Challa Trophy.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      3. Rangoli Aangan · Interactive 3D Floor Rangoli
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Pick from 8 vibrant gulal colors in brass katoris and click the 25 lotus petals and star diamonds on the courtyard floor to paint your own Diwali Mandala.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      4. 7 Diyas Mandap, Temple Bell &amp; Maha-Aarti
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Tap the 7 earthen clay diyas to ignite their flames, ring the brass Mandir Ghanti, and perform a clockwise golden Maha-Aarti around the central Mandap.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      5. Maut Ka Kuan &amp; Giant Carnival Rides
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Steer the stunt car on the vertical wooden wall of the Well of Death to collect 8 golden rings in 20 seconds, or ride the Giant Ferris Wheel, Royal Carousel, and Peacock Ship.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25">
                    <h3 className="font-semibold text-[#f1aa49] mb-1">
                      6. Patakha Zone &amp; Wish Sky Lanterns
                    </h3>
                    <p className="text-xs text-[#d8c39e]">
                      Ignite 3D Anaar fountains, spinning Ground Chakris, and Sky Rockets on the Patakha Pad, wave your handheld Phuljhari, or launch a personalized Wish Sky Lantern.
                    </p>
                  </div>
                </div>
              </section>

              {/* H2 Section 2: How Shops Can Book a Stall & Festive Bazaar */}
              <section className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#fff5de]">
                  How Shops Can Book a Stall in the Mela &amp; Explore the Bazaar
                </h2>
                <p>
                  Walk down the lively bazaar lane to taste virtual silver-leaf Kaju Katli, crispy Kesar
                  Jalebi, Banarasi Tamatar Chaat, Kala Khatta Baraf Gola, Matka Malai Kulfi, and explore
                  the Suhaag Glass Bangle &amp; Mehendi stall. Friendly mela visitors roam the lanes,
                  sit at chaat tables, and greet you with <em>&ldquo;Happy Diwali!&rdquo;</em> whenever
                  you click on them. Right beside the 7 Diyas Mandap rests the brass-bound{' '}
                  <strong>Seva Daan Peti</strong>, where you can scan the charity QR code to help
                  provide warm meals, sweets, and blankets for underprivileged families.
                </p>
                <p>
                  <strong>Book Your Own 3D Shop Stall:</strong> Small businesses, D2C brands, artisans,
                  and creators can book and customize a 3D stall right inside the mela! Simply click{' '}
                  <strong>&ldquo;Promote your shop · Setup 3D Stall&rdquo;</strong> on the homepage or
                  inside the top-right Diya Menu to launch the interactive 3D Stall Builder. Pick an
                  available plot along the main bazaar, enter your shop name, specialty product, canopy
                  color theme, and custom shopkeeper dialogue, and your 3D stall goes live immediately
                  for visitors to explore.
                </p>
              </section>

              {/* H2 Section 3: How to Play */}
              <section className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#fff5de]">
                  How to Play on Mobile &amp; Desktop (No Download)
                </h2>
                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#e5d1b0]">
                  <li>
                    <strong>On Mobile Phones &amp; Tablets:</strong> Use the bottom-left virtual thumb
                    joystick to walk, drag anywhere on the screen to look around the illuminated night
                    sky, and tap the golden proximity button or directly on 3D stalls, crowd visitors,
                    diyas, and games to interact.
                  </li>
                  <li>
                    <strong>On Laptop &amp; Desktop:</strong> Use <kbd className="px-1.5 py-0.5 rounded bg-[#0b101d] border border-[#f1aa49]/30">W A S D</kbd> or Arrow keys to walk, hold <kbd className="px-1.5 py-0.5 rounded bg-[#0b101d] border border-[#f1aa49]/30">Shift</kbd> to run, drag with your mouse to look around, and press <kbd className="px-1.5 py-0.5 rounded bg-[#0b101d] border border-[#f1aa49]/30">E</kbd> to interact.
                  </li>
                  <li>
                    <strong>Invite Friends with Your Name (?from=YourName):</strong> Open the top-right
                    Diya Menu and click &ldquo;Invite Friends (?from=You)&rdquo; or &ldquo;Postcard&rdquo;
                    to send a personalized WhatsApp invite link so the mela welcomes your friends by name!
                  </li>
                </ul>
              </section>

              {/* H2 Section 4: FAQ (Command 6 Exact 5 Questions Word-for-Word) */}
              <section className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#fff5de] flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[#f1aa49]" />
                  Frequently Asked Questions (FAQ)
                </h2>
                <div className="space-y-2.5">
                  {[
                    {
                      q: 'Is Diwali Mela Online free?',
                      a: 'Yes! Diwali Mela Online is 100% free to play in your mobile or desktop browser with no download and no login required. Every game, ride, virtual mithai stall, sparkler, and postcard is completely free.',
                    },
                    {
                      q: 'When is Diwali 2026?',
                      a: 'In 2026, main Diwali (Lakshmi-Ganesh Puja) will be celebrated on Sunday, 8 November 2026. The 5-day festival runs from Dhanteras on Friday, 6 November 2026 through Bhai Dooj on Tuesday, 10 November 2026.',
                    },
                    {
                      q: 'How do I play the Diwali mela games?',
                      a: 'Click "Enter Diwali Mela" to step into the 3D fairground. Walk up to any game stall using the mobile joystick or WASD keys (or tap a quick-teleport pill), then click or tap directly in 3D to pop balloons, toss golden rings, paint floor rangoli, or steer your stunt car inside Maut Ka Kuan.',
                    },
                    {
                      q: 'Can I light a diya online for someone?',
                      a: 'Yes! Walk to the central 7 Diyas Deepotsav Mandap and tap each of the 7 earthen clay diyas to ignite their golden flames, ring the temple bell, and perform Maha-Aarti. You can also launch a personalized Wish Sky Lantern with their name and send them a custom WhatsApp invitation link.',
                    },
                    {
                      q: 'How do I book a stall in the mela?',
                      a: 'Click "Promote your shop · Setup 3D Stall" on the welcome screen or inside the top-right Diya Menu to open the 3D Stall Builder. Select an open bazaar plot, customize your shop name, canopy colors, product specialty, and shopkeeper Q&A, and publish your 3D stall in the mela.',
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/25"
                    >
                      <h3 className="font-semibold text-[#fff5de] mb-1">{item.q}</h3>
                      <p className="text-xs sm:text-sm text-[#d8c39e]">{item.a}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Internal Links Footer */}
              <nav
                aria-label="Explore More Diwali 2026 Guides"
                className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-xs font-semibold text-[#f1aa49]">
                  EXPLORE ALL 5 DIWALI 2026 GUIDE PAGES:
                </span>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/diwali-2026-date.html"
                    className="text-xs text-[#ffd27d] hover:underline"
                  >
                    Diwali 2026 Date &amp; Muhurat →
                  </a>
                  <a
                    href="/light-a-diya-online.html"
                    className="text-xs text-[#ffd27d] hover:underline"
                  >
                    Light a Diya Online →
                  </a>
                  <a
                    href="/diwali-mela-games.html"
                    className="text-xs text-[#ffd27d] hover:underline"
                  >
                    3D Diwali Mela Games →
                  </a>
                  <a
                    href="/diwali-wishes.html"
                    className="text-xs text-[#ffd27d] hover:underline"
                  >
                    Happy Diwali Wishes 2026 →
                  </a>
                  <a
                    href="/hindi.html"
                    className="text-xs text-[#ffd27d] hover:underline"
                  >
                    दीवाली मेला ऑनलाइन (Hindi) →
                  </a>
                </div>
              </nav>
            </div>
          )}

          {/* PAGE 2: /diwali-2026-date */}
          {activeSlug === '/diwali-2026-date' && (
            <div className="space-y-6">
              <header className="space-y-2 border-b border-[#f1aa49]/25 pb-4">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  PANCHANG &amp; FESTIVAL CALENDAR · DIWALI 2026
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de]">
                  When is Diwali 2026? Date, Lakshmi Puja Muhurat &amp; 5-Day Calendar
                </h1>
                <p className="text-sm text-[#e5d1b0]">
                  In 2026, <strong>Diwali (Badi Diwali / Lakshmi Puja)</strong> will be celebrated on{' '}
                  <strong className="text-[#f1aa49]">Sunday, 8 November 2026</strong>. The auspicious
                  five-day Deepotsav festival begins with Dhanteras on Friday, 6 November 2026 and
                  concludes with Bhai Dooj on Tuesday, 10 November 2026.
                </p>
              </header>

              <section className="space-y-3">
                <h2 className="text-xl font-display font-bold text-[#fff5de]">
                  Complete 5-Day Diwali 2026 Festival Schedule
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      day: 'Day 1 · Friday, 6 November 2026',
                      title: 'Dhanteras (Dhantrayodashi)',
                      desc: 'Auspicious day for worshiping Lord Dhanvantari and Maa Lakshmi, purchasing gold/utensils, and lighting the first Yama Deepam at the entrance.',
                    },
                    {
                      day: 'Day 2 · Saturday, 7 November 2026',
                      title: 'Choti Diwali (Narak Chaturdashi / Roop Chaudas)',
                      desc: 'Celebrates the victory of Lord Krishna over Narakasura. Homes are decorated with fresh marigold torans, floor rangolis, and 14 earthen diyas.',
                    },
                    {
                      day: 'Day 3 · Sunday, 8 November 2026',
                      title: 'Main Diwali · Lakshmi-Ganesh Puja & Deepotsav',
                      desc: 'The principal night of Deepavali on Kartik Amavasya. Pradosh Kaal Lakshmi Puja Muhurat: 05:54 PM to 08:26 PM IST (Vrishabha Lagna).',
                    },
                    {
                      day: 'Day 4 · Monday, 9 November 2026',
                      title: 'Govardhan Puja & Annakoot (Padwa)',
                      desc: 'Devotees prepare Annakoot bhog and honor Lord Krishna lifting Govardhan Parvat to protect the people of Braj.',
                    },
                    {
                      day: 'Day 5 · Tuesday, 10 November 2026',
                      title: 'Bhai Dooj (Bhau Beej / Yama Dwitiya)',
                      desc: 'Sisters apply tilak and perform aarti for their brothers’ long life and happiness, concluding the 5-day Diwali mahotsav.',
                    },
                  ].map((d) => (
                    <div
                      key={d.day}
                      className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-mono-num font-bold text-[#f1aa49]">
                          {d.day}
                        </div>
                        <h3 className="text-base font-display font-bold text-[#fff5de]">
                          {d.title}
                        </h3>
                        <p className="text-xs text-[#d8c39e] mt-1">{d.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEnter3DAttraction('game-diya');
                        }}
                        className="px-3.5 py-2 rounded-lg bg-[#18243d] border border-[#f1aa49]/40 text-xs font-semibold text-[#ffd27d] hover:bg-[#223356] shrink-0 cursor-pointer"
                      >
                        Celebrate in 3D →
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug('/', true);
                  }}
                  className="text-[#f1aa49] hover:underline"
                >
                  ← Back to Diwali Mela Online Homepage
                </a>
                <div className="flex gap-4">
                  <a
                    href="/light-a-diya-online"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/light-a-diya-online', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Light a Diya Online →
                  </a>
                  <a
                    href="/diwali-wishes"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-wishes', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Diwali Wishes 2026 →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 3: /light-a-diya-online */}
          {activeSlug === '/light-a-diya-online' && (
            <div className="space-y-6">
              <header className="space-y-2 border-b border-[#f1aa49]/25 pb-4">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  VIRTUAL DEEPOTSAV · तमसो मा ज्योतिर्गमय
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de]">
                  Light a Diya Online — Virtual Deepotsav Mandap 2026
                </h1>
                <p className="text-sm text-[#e5d1b0]">
                  Distance should never keep us from lighting a lamp together. Whether you are living
                  away from home in a hostel, working in another city, or celebrating with loved ones
                  across the globe, you can <strong>light a diya online</strong> at our 3D Deepotsav
                  Mandap and join <strong>{communityDiyas.toLocaleString()}+ community diyas</strong>{' '}
                  glowing tonight.
                </p>
              </header>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#0b101d] border border-[#f1aa49]/35 space-y-3">
                  <h2 className="text-lg font-display font-bold text-[#fff5de]">
                    Light the 7 Earthen Diyas in 3D
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    At the heart of the fairgrounds stands the circular Deepotsav Mandap surrounded by 7
                    handcrafted terracotta diyas representing health, wisdom, prosperity, peace,
                    kindness, unity, and gratitude. Tap each diya in 3D to ignite its golden flame.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEnter3DAttraction('game-diya');
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] font-bold text-xs hover:bg-[#ffbe61] transition-colors cursor-pointer"
                  >
                    🪔 Walk to 7 Diyas Mandap &amp; Light Diyas Now →
                  </button>
                </div>

                <div className="p-5 rounded-2xl bg-[#0b101d] border border-[#f1aa49]/35 space-y-3">
                  <h2 className="text-lg font-display font-bold text-[#fff5de]">
                    Light a Real Diya in a Poor Family&apos;s Home
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    Right beside the 7 Diyas Mandap rests our brass-bound <strong>Seva Daan Peti</strong>.
                    Scan the QR code to contribute towards warm meals, mithai boxes, and blankets for
                    underprivileged families so their homes also glow with happiness tonight.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDaanPeti();
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#1a2642] border border-[#f1aa49]/50 text-[#ffd27d] font-bold text-xs hover:bg-[#24355c] transition-colors cursor-pointer"
                  >
                    ♥ Open Seva Daan Peti Charity QR →
                  </button>
                </div>
              </section>

              <div className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug('/', true);
                  }}
                  className="text-[#f1aa49] hover:underline"
                >
                  ← Back to Diwali Mela Online Homepage
                </a>
                <div className="flex gap-4">
                  <a
                    href="/diwali-mela-games"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-mela-games', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Explore 3D Mela Games →
                  </a>
                  <a
                    href="/diwali-2026-date"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-2026-date', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Diwali 2026 Muhurat →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 4: /diwali-mela-games */}
          {activeSlug === '/diwali-mela-games' && (
            <div className="space-y-6">
              <header className="space-y-2 border-b border-[#f1aa49]/25 pb-4">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  FREE BROWSER GAMES · NO DOWNLOAD REQUIRED
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de]">
                  Diwali Game Online Free — Play 3D Indian Mela Games &amp; Rides
                </h1>
                <p className="text-sm text-[#e5d1b0]">
                  Looking for a <strong>diwali game online free</strong> to play with friends? Step right
                  into our <strong>diwali mela game 3d</strong> fairground and experience six authentic
                  Indian carnival attractions directly in your browser.
                </p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    id: 'game-balloon',
                    title: 'Nishana Lagao · Balloon Shooting Game',
                    desc: 'Aim at bobbing colourful balloons on the wooden target board. Pop them with 3 free shots to win the Diwali Teddy Prize.',
                    cta: 'Play Balloon Shoot →',
                  },
                  {
                    id: 'game-ring',
                    title: 'Swarna Challa · Golden Ring Toss',
                    desc: 'Tap or swipe up to toss 5 golden rings onto the prize pedestals. Land a ring to win the Swarna Challa Trophy.',
                    cta: 'Play Ring Toss →',
                  },
                  {
                    id: 'rangoli-art',
                    title: 'Rangoli Aangan · 3D Floor Mandala Art',
                    desc: 'Select from 8 vibrant gulal colors in brass bowls and click the 25 lotus petals and star diamonds on the floor.',
                    cta: 'Paint 3D Rangoli →',
                  },
                  {
                    id: 'ride-well',
                    title: 'Maut Ka Kuan · Well of Death Stunt Game',
                    desc: 'Steer higher or lower and hit Turbo Boost on the vertical wooden wall to grab 8 golden Diwali rings in 20 seconds.',
                    cta: 'Ride Maut Ka Kuan →',
                  },
                  {
                    id: 'ride-wheel',
                    title: 'Chand Wala Jhoola · Giant Ferris Wheel',
                    desc: 'Board a glowing gondola and rise 28 meters above the fairgrounds for a panoramic view of the diyas and sky lanterns.',
                    cta: 'Ride Giant Wheel →',
                  },
                  {
                    id: 'finale-tower',
                    title: '1008 Akashdeep Sky Lantern Finale',
                    desc: 'Ignite the 20-meter Swarna Deep-Stambh and watch hundreds of glowing sky lanterns and fireworks fill the night sky.',
                    cta: 'Launch Finale →',
                  },
                ].map((g) => (
                  <div
                    key={g.id}
                    className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <h2 className="text-base font-display font-bold text-[#fff5de]">
                        {g.title}
                      </h2>
                      <p className="text-xs text-[#d8c39e] mt-1">{g.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEnter3DAttraction(g.id);
                      }}
                      className="self-start px-3.5 py-2 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-bold hover:bg-[#ffbe61] transition-colors cursor-pointer"
                    >
                      {g.cta}
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug('/', true);
                  }}
                  className="text-[#f1aa49] hover:underline"
                >
                  ← Back to Diwali Mela Online Homepage
                </a>
                <div className="flex gap-4">
                  <a
                    href="/light-a-diya-online"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/light-a-diya-online', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Light a Diya Online →
                  </a>
                  <a
                    href="/hindi"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/hindi', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    दीवाली मेला ऑनलाइन (Hindi) →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 5: /diwali-wishes */}
          {activeSlug === '/diwali-wishes' && (
            <div className="space-y-6">
              <header className="space-y-2 border-b border-[#f1aa49]/25 pb-4">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  CELEBRATE DIWALI ONLINE WITH FRIENDS · WHATSAPP READY
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de]">
                  Happy Diwali 2026 Wishes, Hindi Shayari &amp; Virtual Mela Invites
                </h1>
                <p className="text-sm text-[#e5d1b0]">
                  Want to <strong>celebrate Diwali online</strong> and send something more memorable
                  than a forwarded image? Copy any of these original Diwali 2026 wishes below or share
                  them directly on WhatsApp—each message includes an invitation link to walk through the
                  3D Diwali Mela together!
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DIWALI_WISHES_COLLECTION.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#f1aa49] mb-1">
                        {w.category.toUpperCase()}
                      </div>
                      <p className="text-xs sm:text-sm text-[#fff5de] leading-relaxed">
                        &ldquo;{w.text}&rdquo;
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#f1aa49]/15">
                      <button
                        type="button"
                        onClick={() => handleCopyWish(w.text, idx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18243d] border border-[#f1aa49]/35 text-xs font-semibold text-[#ffd27d] hover:bg-[#223356] cursor-pointer"
                      >
                        {copiedIdx === idx ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedIdx === idx ? 'Copied with Link!' : 'Copy Wish + Link'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleWhatsAppShare(w.text)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-bold hover:bg-[#ffbe61] cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Share on WhatsApp ↗
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug('/', true);
                  }}
                  className="text-[#f1aa49] hover:underline"
                >
                  ← Back to Diwali Mela Online Homepage
                </a>
                <div className="flex gap-4">
                  <a
                    href="/diwali-2026-date"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-2026-date', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Diwali 2026 Date &amp; Muhurat →
                  </a>
                  <a
                    href="/light-a-diya-online"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/light-a-diya-online', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    Light a Diya Online →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 6: /hindi (दीवाली मेला ऑनलाइन · Diwali Mela Online Khele) */}
          {activeSlug === '/hindi' && (
            <div className="space-y-6">
              <header className="space-y-2 border-b border-[#f1aa49]/25 pb-4">
                <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                  दीवाली मेला ऑनलाइन २०२६ · DIWALI PAR GHAR BAITHE MELA
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de]">
                  दीवाली मेला ऑनलाइन (Diwali Mela Online Khele) — घर बैठे 3D मेला घूमें
                </h1>
                <p className="text-sm text-[#e5d1b0] leading-relaxed">
                  क्या आप भी बचपन वाले मेले की रौनक याद करते हैं? <strong>दीवाली मेला ऑनलाइन</strong>{' '}
                  (<strong>diwali mela online khele</strong>) में आपका स्वागत है! अब{' '}
                  <strong>diwali par ghar baithe mela</strong> घूमने का आनंद लें—बिना किसी ऐप डाउनलोड के,
                  बिल्कुल मुफ़्त।
                </p>
              </header>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 space-y-2">
                  <h2 className="text-lg font-display font-bold text-[#f1aa49]">
                    १. दीपोत्सव मंडप और रंगोली आँगन
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    मेले के बीचों-बीच बने भव्य दीपोत्सव मंडप में अपने हाथों से ७ मिट्टी के दीये जलाएं और रंगोली आँगन में ८ शुभ गुलाल रंगों से 3D कमल रंगोली सजाएं।
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 space-y-2">
                  <h2 className="text-lg font-display font-bold text-[#f1aa49]">
                    २. चाँद वाला झूला, मौत का कुआँ और निशानेबाजी
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    गुब्बारे फोड़ने का खेल (निशाना लगाओ), सुनहरा छल्ला फेंकने का खेल, विशाल चाँद वाला झूला, और रोमांचक मौत का कुआँ—सब कुछ मुफ़्त खेलें!
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 space-y-2">
                  <h2 className="text-lg font-display font-bold text-[#f1aa49]">
                    ३. गरमा-गरम जलेबी, चाट और कुल्हड़ चाय
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    काका हलवाई की काजू कतली, केसर जलेबी, बनारसी टमाटर चाट और कुल्हड़ मसाला चाय का स्वाद लें और अपनी मेला झोला (Souvenir Bag) भरें।
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/30 space-y-2">
                  <h2 className="text-lg font-display font-bold text-[#f1aa49]">
                    ४. सेवा दान पेटी — किसी गरीब के घर भी जले खुशियों का दीया
                  </h2>
                  <p className="text-xs text-[#d8c39e] leading-relaxed">
                    ७ दीयों वाले मंडप के पास रखी दान पेटी पर क्लिक करें और QR कोड स्कैन करके ज़रूरतमंद परिवारों के भोजन, मिठाई और कंबल के लिए सहयोग करें।
                  </p>
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnter3DAttraction();
                  }}
                  className="px-5 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-bold text-xs hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  अभी 3D दीवाली मेला में प्रवेश करें →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnter3DAttraction('rangoli-art');
                  }}
                  className="px-4 py-3 rounded-xl bg-[#18243d] border border-[#f1aa49]/40 text-[#ffd27d] font-semibold text-xs hover:bg-[#223356] transition-colors cursor-pointer"
                >
                  🎨 3D रंगोली सजाएं →
                </button>
              </div>

              <div className="pt-4 border-t border-[#f1aa49]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSlug('/', true);
                  }}
                  className="text-[#f1aa49] hover:underline"
                >
                  ← Back to English Homepage
                </a>
                <div className="flex gap-4">
                  <a
                    href="/diwali-wishes"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-wishes', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    दिवाली शुभकामनाएं (Wishes) →
                  </a>
                  <a
                    href="/diwali-mela-games"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateSlug('/diwali-mela-games', true);
                    }}
                    className="text-[#ffd27d] hover:underline"
                  >
                    मेला गेम्स (Games) →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* CLEAN 404 PAGE */}
          {activeSlug === '404' && (
            <div className="py-12 text-center space-y-4">
              <div className="text-xs font-bold tracking-widest text-[#f1aa49]">
                404 · PAGE NOT FOUND
              </div>
              <h1 className="text-3xl font-display font-bold text-[#fff5de]">
                Arre! Yeh gali mele ke bahar nikal gayi!
              </h1>
              <p className="text-sm text-[#d8c39e] max-w-md mx-auto">
                The page you were looking for doesn&apos;t exist, but the lights, jalebis, and giant
                wheel inside <strong>Diwali Mela Online</strong> are glowing right now.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateSlug('/', false);
                    onClose();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] text-xs font-bold hover:bg-[#ffbe61] cursor-pointer"
                >
                  Return to Diwali Mela Homepage →
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateSlug('/diwali-mela-games', true)}
                  className="px-4 py-2.5 rounded-xl bg-[#18243d] border border-[#f1aa49]/40 text-xs font-semibold text-[#ffd27d] hover:bg-[#223356] cursor-pointer"
                >
                  Explore Mela Games →
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
};
