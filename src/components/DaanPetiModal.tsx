import React, { useState } from 'react';
import { X, Heart, Sparkles, Maximize2, Minimize2, Flame, ShieldCheck } from 'lucide-react';

export const USER_QR_IMAGE_URL =
  '/assets/aistudio/WhatsApp_Image_2026-10-21_at_10.56.40_PM_a73914be.jpeg';

interface DaanPetiModalProps {
  onClose: () => void;
  onConfirmDonation: (amount: number, donorName: string, wish: string) => void;
  onToast: (msg: string) => void;
}

const IMPACT_TIERS = [
  {
    amount: 51,
    label: '₹51',
    title: 'Ek Thali Garam Bhojan',
    desc: 'Warm festive meal & sweet jalebi for a hungry child on the street tonight.',
  },
  {
    amount: 151,
    label: '₹151',
    title: 'Bachpan Ki Muskaan',
    desc: 'Mithai box, earthen diyas & warm clothes for an underprivileged child.',
  },
  {
    amount: 501,
    label: '₹501',
    title: 'Ghar Ki Rasoi & Kambal',
    desc: 'Dry ration kit & warm winter blanket for an elderly or daily-wage family.',
  },
  {
    amount: 1100,
    label: '₹1,100',
    title: 'Maha Annadaan Seva',
    desc: 'Sponsors hot Diwali dinners, sweets & blankets for 10+ needy people.',
  },
];

export const DaanPetiModal: React.FC<DaanPetiModalProps> = ({
  onClose,
  onConfirmDonation,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(151);
  const [donorName, setDonorName] = useState('');
  const [donorWish, setDonorWish] = useState('');
  const [zoomQr, setZoomQr] = useState(false);

  const handleDropCoinInPeti = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmDonation(
      selectedAmount,
      donorName.trim() || 'Gupt Daani (Kind Soul)',
      donorWish.trim()
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#070b14]/90 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Seva Daan Peti Charity QR Code"
    >
      <div className="relative w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-2xl bg-[#121a2d] border-2 border-[#f1aa49]/70 p-5 sm:p-7 text-[#f7e7c4] shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close Daan Peti"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-[#f1aa49] mb-1.5">
          <Flame className="w-4 h-4 text-[#f1aa49]" />
          <span>सेवा दान पेटी · SEVA DAAN PETI (NEAR 7 DIYAS MANDAP)</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#fff5de] leading-tight mb-3 pr-10">
          Kisi Gareeb Ke Ghar Bhi Jale{' '}
          <em className="font-normal text-[#f1aa49]">Khushiyon Ka Diya.</em>
        </h2>

        {/* Heart-Touching Hindi Shayari & Emotional Appeal Banner */}
        <div className="p-4 rounded-xl bg-[#0b101d] border border-[#f1aa49]/40 mb-5">
          <p className="font-display italic text-base sm:text-lg text-[#ffe2a8] leading-relaxed text-center">
            “अपने घर के दीये तो हर कोई जलाता है,
            <br />
            असली दिवाली तो तब है, जब आपकी वजह से किसी गरीब के घर चूल्हा जल पाता है।
            <br />
            थोड़ा सा बांट लो अपनी खुशियों का उजाला,
            <br />
            किसी मासूम की सूनी हथेली पर भी रख दो एक दीया प्यार वाला।”
          </p>
          <p className="text-xs sm:text-sm text-[#d8c39e] text-center mt-2.5 leading-relaxed">
            Tonight, while our homes glow with lights and sweets, thousands of children and elderly people on the streets watch the festival with empty hands and hungry stomachs. Even{' '}
            <strong className="text-[#fff5de]">₹21, ₹51, or ₹151</strong> from you can put a warm meal, a box of mithai, and a blanket into someone&apos;s hands tonight.
          </p>
        </div>

        {/* Full-screen QR Zoom View (if clicked) */}
        {zoomQr ? (
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#0b101d] border border-[#f1aa49]/50 text-center">
            <div className="text-xs font-semibold tracking-widest text-[#f1aa49] mb-3">
              SCAN WITH GOOGLE PAY · PHONEPE · PAYTM · ANY UPI APP
            </div>
            <div className="p-4 rounded-2xl bg-white shadow-2xl mb-4">
              <img
                src={USER_QR_IMAGE_URL}
                alt="Scannable Google Pay UPI QR Code for Diwali Charity Donation"
                className="w-72 h-72 sm:w-80 sm:h-80 object-contain block select-none"
              />
            </div>
            <p className="text-xs text-[#e5c99b] mb-4 max-w-md">
              Point your phone camera or any UPI app directly at the QR code above to donate any amount from your heart.
            </p>
            <button
              type="button"
              onClick={() => setZoomQr(false)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] text-xs font-bold hover:bg-[#ffbe61] transition-colors cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" />
              Back to Seva Details
            </button>
          </div>
        ) : (
          /* Main Two-Column Layout: Scannable QR Code + Impact Tiers */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Left Column: Crisp, Uncropped Scannable QR Code */}
            <div className="md:col-span-5 flex flex-col items-center justify-between p-4 rounded-2xl bg-[#0b101d] border-2 border-[#f1aa49]/50">
              <div className="text-center">
                <div className="text-[11px] font-bold tracking-widest text-[#f1aa49]">
                  SCAN &amp; DONATE ANY AMOUNT
                </div>
                <div className="text-[11px] text-[#b8a17d] mt-0.5">
                  Works with GPay, PhonePe, Paytm &amp; BHIM
                </div>
              </div>

              {/* Pure White Quiet-Zone Container so every camera scans immediately */}
              <div
                onClick={() => setZoomQr(true)}
                className="my-3 p-3 rounded-2xl bg-white shadow-2xl cursor-pointer hover:scale-[1.02] transition-transform"
                title="Click to enlarge QR code"
              >
                <img
                  src={USER_QR_IMAGE_URL}
                  alt="Scannable UPI QR Code for Diwali Seva Charity"
                  className="w-60 h-60 sm:w-64 sm:h-64 object-contain block select-none"
                />
              </div>

              <div className="w-full space-y-2">
                <button
                  type="button"
                  onClick={() => setZoomQr(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#18233c] border border-[#f1aa49]/35 text-xs font-semibold text-[#ffe0a3] hover:bg-[#223152] transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#f1aa49]" />
                  Enlarge QR for Easy Scanning
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#b8a17d] text-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#f1aa49] shrink-0" />
                  <span>Direct Seva · 100% goes to food, sweets &amp; blankets</span>
                </div>
              </div>
            </div>

            {/* Right Column: Heartfelt Impact Tiers & Blessing Record */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-wider text-[#f1aa49] mb-2">
                  HOW YOUR SEVA LIGHTS UP A LIFE TONIGHT
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {IMPACT_TIERS.map((tier) => {
                    const active = selectedAmount === tier.amount;
                    return (
                      <button
                        key={tier.amount}
                        type="button"
                        onClick={() => setSelectedAmount(tier.amount)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#f1aa49]/20 border-[#f1aa49] text-[#fff5de]'
                            : 'bg-[#0b101d] border-[#f1aa49]/25 text-[#d8c39e] hover:border-[#f1aa49]/60'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-base font-mono-num font-bold text-[#f1aa49]">
                            {tier.label}
                          </span>
                          <span className="text-[11px] font-semibold text-[#fff5de]">
                            {tier.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#d8c39e] leading-snug mt-1">
                          {tier.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quote Box */}
              <div className="px-3.5 py-2.5 rounded-xl bg-[#182238]/80 border border-[#f1aa49]/25 text-xs text-[#eed7b1] leading-relaxed">
                <strong className="text-[#f1aa49]">“दिए से दिया जले तो रोशनी होती है, पर किसी भूखे को रोटी मिले तो असली बंदगी होती है।”</strong>{' '}
                — No contribution is too small; even ₹10 or ₹21 given with love brings immense blessings.
              </div>

              {/* Record Your Seva & Light a Celebration Burst at the 7 Diyas Mandap */}
              <form
                onSubmit={handleDropCoinInPeti}
                className="space-y-3 pt-2 border-t border-[#f1aa49]/20"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#e5c99b] mb-1">
                      YOUR NAME (OR GUPT DAANI)
                    </label>
                    <input
                      type="text"
                      maxLength={36}
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      placeholder="Your name for Diwali blessings..."
                      className="w-full px-3 py-2 rounded-lg bg-[#0b101d] border border-[#f1aa49]/30 text-xs text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#e5c99b] mb-1">
                      AMOUNT DONATED (₹)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500000}
                      value={selectedAmount}
                      onChange={(e) => setSelectedAmount(Math.max(1, Number(e.target.value)))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b101d] border border-[#f1aa49]/30 text-xs font-mono-num text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#e5c99b] mb-1">
                    LEAVE A BLESSING / DUA FOR FAMILIES IN NEED
                  </label>
                  <input
                    type="text"
                    maxLength={90}
                    value={donorWish}
                    onChange={(e) => setDonorWish(e.target.value)}
                    placeholder="Kisi ki thali kabhi khali na rahe, sabko khushiyan milein..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0b101d] border border-[#f1aa49]/30 text-xs text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#f1aa49] text-[#121726] font-bold text-sm hover:bg-[#ffbe61] transition-colors shadow-lg cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  I Have Scanned &amp; Donated · Ring the Seva Bell 🪔
                </button>
              </form>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#d8c39e] text-center">
                <Heart className="w-3.5 h-3.5 text-[#e87a70] shrink-0" />
                <span>
                  May Maa Lakshmi bless your home with tenfold peace, health, and prosperity this Deepavali.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
