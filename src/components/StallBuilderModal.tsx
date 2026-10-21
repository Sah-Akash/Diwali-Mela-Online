import React, { useState } from 'react';
import { X, Sparkles, MapPin, Search, ExternalLink } from 'lucide-react';
import {
  PartnerStallData,
  STALL_SLOTS,
  StallTheme,
  THEME_COLORS,
} from '../data/melaData';

interface StallBuilderModalProps {
  mode: 'create' | 'directory';
  partners: PartnerStallData[];
  onClose: () => void;
  onSaveStall: (stall: PartnerStallData) => void;
  onTeleportToStall: (stallId: string) => void;
  onSwitchTab: (tab: 'create' | 'directory') => void;
}

export const StallBuilderModal: React.FC<StallBuilderModalProps> = ({
  mode,
  partners,
  onClose,
  onSaveStall,
  onTeleportToStall,
  onSwitchTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<PartnerStallData>({
    id: `custom-${Date.now()}`,
    slotId: STALL_SLOTS[2].id,
    name: 'Aarav Festive Crafts',
    category: 'shop',
    theme: 'kesari',
    plan: 'featured',
    greeting: 'Shubh Deepavali! Handcrafted brass diyas, scented candles aur festive gift hampers dekhiye!',
    question: 'Is Diwali par sabse खास तोहफा kya hai?',
    answer: 'Hamara Heritage Diwali Box jismein 4 brass urlis, kesar mithai aur handwritten greeting card shamil hai!',
    instagram: 'https://www.instagram.com/yourbrand',
    productUrl: 'https://yourshop.com',
  });

  const handleSubmitStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handlePublishAndVisit = () => {
    const newStall: PartnerStallData = {
      ...form,
      id: `partner-custom-${form.slotId}`,
      name: form.name.trim() || 'My Diwali Stall',
    };
    onSaveStall(newStall);
    onTeleportToStall(newStall.id);
    onClose();
  };

  const filteredPartners = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.greeting.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTheme = THEME_COLORS[form.theme];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090d18]/85"
      role="dialog"
      aria-modal="true"
      aria-label="Diwali Mela Stalls and Brand Placement"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#131b2e] border border-[#f1aa49]/40 p-6 text-[#f7e7c4] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Segmented Filter Control */}
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0c1220] border border-[#f1aa49]/25 mb-5">
          <button
            onClick={() => onSwitchTab('create')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'create'
                ? 'bg-[#f1aa49] text-[#111726] font-semibold'
                : 'text-[#d8c39e] hover:text-white'
            }`}
          >
            Place Your 3D Stall
          </button>
          <button
            onClick={() => onSwitchTab('directory')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'directory'
                ? 'bg-[#f1aa49] text-[#111726] font-semibold'
                : 'text-[#d8c39e] hover:text-white'
            }`}
          >
            Explore Mela Partners ({partners.length})
          </button>
        </div>

        {mode === 'directory' ? (
          <div>
            <div className="text-xs font-medium tracking-wider text-[#f1aa49] mb-1">
              DIWALI BAZAAR DIRECTORY · INSTANT TELEPORT
            </div>
            <h2 className="text-2xl font-display font-semibold text-[#fff5de] mb-2">
              Meet the Brands of Our Diwali Mela
            </h2>
            <p className="text-sm text-[#d8c39e] mb-4">
              Walk up to any stall in the 3D bazaar or teleport directly to chat with their shopkeeper.
            </p>

            <div className="relative mb-4">
              <Search className="w-4 h-4 text-[#b8a17d] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stall or brand name..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
              />
            </div>

            <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
              {filteredPartners.map((p) => {
                const slot = STALL_SLOTS.find((s) => s.id === p.slotId);
                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-[#0d1322] border border-[#f1aa49]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#f1aa49] mb-1">
                        <span>{p.plan === 'featured' ? '★ Featured Stall' : '✦ Mela Partner'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{slot?.name || 'Bazaar Lane'}</span>
                      </div>
                      <h3 className="text-base font-display font-semibold text-[#fff5de]">
                        {p.name}
                      </h3>
                      <p className="text-xs text-[#d8c39e] mt-1 line-clamp-2">
                        “{p.greeting}”
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.productUrl && (
                        <a
                          href={p.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-lg bg-[#1d2842] text-xs font-medium text-[#f7e7c4] hover:bg-[#273659] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          Shop <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          onTeleportToStall(p.id);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Visit in 3D →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-xs font-medium tracking-wider text-[#f1aa49] mb-1">
              YOUR BRAND. OUR DIWALI MELA.
            </div>
            <h2 className="text-2xl font-display font-semibold text-[#fff5de] mb-1">
              Apni dukaan. <em className="font-normal text-[#f1aa49]">Apna andaaz.</em>
            </h2>
            <p className="text-sm text-[#d8c39e] mb-4">
              Customize your own 3D Diwali stall—choose your bazaar spot, canopy colour, and shopkeeper dialogue, then walk right up to it in the live 3D mela!
            </p>

            {/* Live 3D Stall Design Preview Card */}
            <div
              className="mb-5 p-4 rounded-xl border border-[#f1aa49]/40 bg-[#0d1322]"
              style={{ borderTopWidth: '4px', borderTopColor: selectedTheme.css }}
            >
              <div className="flex items-center justify-between text-xs text-[#e5c99b] mb-1.5">
                <span>
                  {form.plan === 'featured' ? '★ FEATURED DIWALI STALL' : '✦ MELA PARTNER STALL'}
                </span>
                <span>{STALL_SLOTS.find((s) => s.id === form.slotId)?.name}</span>
              </div>
              <div className="text-lg font-display font-bold text-[#fff5de]">
                {form.name || 'Your Brand Name'}
              </div>
              <p className="text-xs text-[#d8c39e] mt-1 italic">
                Shopkeeper: “{form.greeting || 'Shubh Deepavali! Aaiye hamari dukaan dekhiye!'}”
              </p>
            </div>

            {step === 1 ? (
              <form onSubmit={handleSubmitStep1} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      STALL / BRAND NAME
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={34}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Meera's Handmade"
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      CHOOSE BAZAAR LOCATION
                    </label>
                    <select
                      value={form.slotId}
                      onChange={(e) => setForm({ ...form, slotId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    >
                      {STALL_SLOTS.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      STALL CANOPY COLOUR
                    </label>
                    <select
                      value={form.theme}
                      onChange={(e) => setForm({ ...form, theme: e.target.value as StallTheme })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    >
                      {Object.entries(THEME_COLORS).map(([key, val]) => (
                        <option key={key} value={key}>
                          {val.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      WEBSITE OR INSTAGRAM LINK
                    </label>
                    <input
                      type="text"
                      value={form.productUrl || ''}
                      onChange={(e) => setForm({ ...form, productUrl: e.target.value })}
                      placeholder="https://yourshop.com"
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                    SHOPKEEPER'S WELCOME LINE (HINDI / HINGLISH / ENGLISH)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={140}
                    value={form.greeting}
                    onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      VISITOR QUESTION BUTTON
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={form.question}
                      onChange={(e) => setForm({ ...form, question: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#e5c99b] mb-1">
                      SHOPKEEPER'S ANSWER
                    </label>
                    <input
                      type="text"
                      maxLength={160}
                      value={form.answer}
                      onChange={(e) => setForm({ ...form, answer: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/30 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                  >
                    Preview My 3D Stall →
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#0d1322] border border-[#f1aa49]/30 space-y-2 text-sm">
                  <div className="font-semibold text-[#fff5de]">
                    Ready to spawn in the 3D Diwali Bazaar!
                  </div>
                  <p className="text-xs text-[#d8c39e]">
                    Visitor asks: <strong className="text-[#fff5de]">“{form.question}”</strong>
                  </p>
                  <p className="text-xs text-[#d8c39e]">
                    Your shopkeeper replies: <strong className="text-[#f1aa49]">“{form.answer}”</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-lg bg-[#1d2842] text-xs font-medium text-[#f7e7c4] hover:bg-[#273659] transition-colors cursor-pointer"
                  >
                    ← Edit Stall Details
                  </button>

                  <button
                    type="button"
                    onClick={handlePublishAndVisit}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    Spawn & Teleport to My 3D Stall →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
