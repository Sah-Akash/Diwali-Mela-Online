import React, { useEffect, useRef, useState } from 'react';
import { Download, Copy, Check, Share2, X } from 'lucide-react';
import { PlayerStats } from '../three/MelaEngine';

interface PostcardModalProps {
  snapshotUrl: string;
  stats: PlayerStats;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const PostcardModal: React.FC<PostcardModalProps> = ({
  snapshotUrl,
  stats,
  onClose,
  onToast,
}) => {
  const [visitorName, setVisitorName] = useState('Aapka Dost');
  const [cardDataUrl, setCardDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = 1080;
      canvas.height = 720;

      // Deep festive obsidian & maroon background
      const grad = ctx.createLinearGradient(0, 0, 1080, 720);
      grad.addColorStop(0, '#181026');
      grad.addColorStop(0.5, '#2d111f');
      grad.addColorStop(1, '#121b2d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 720);

      // Ornate double gold zari border
      ctx.strokeStyle = '#f4b855';
      ctx.lineWidth = 6;
      ctx.strokeRect(24, 24, 1032, 672);

      ctx.strokeStyle = 'rgba(244, 184, 85, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, 1008, 648);

      // Draw 3D Mela Snapshot on left/top area
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(56, 60, 600, 440, 14);
      ctx.clip();
      ctx.drawImage(img, 56, 60, 600, 440);
      ctx.restore();

      ctx.strokeStyle = '#f4b855';
      ctx.lineWidth = 3;
      ctx.strokeRect(56, 60, 600, 440);

      // Right Column: Postcard Copy
      ctx.fillStyle = '#f4b855';
      ctx.font = '600 18px "DM Sans", sans-serif';
      ctx.fillText('SHUBH DEEPAVALI · DIWALI MELA 2026', 690, 96);

      ctx.fillStyle = '#fff5de';
      ctx.font = '700 42px "Playfair Display", Georgia, serif';
      ctx.fillText('Diwali Mela', 690, 152);
      ctx.fillText('Chaloge Mere Sath?', 690, 202);

      ctx.fillStyle = '#e7cfa1';
      ctx.font = '400 20px "DM Sans", sans-serif';
      ctx.fillText(`With love from: ${visitorName || 'Aapka Dost'}`, 690, 255);

      // Stats Box
      ctx.fillStyle = 'rgba(255, 210, 125, 0.08)';
      ctx.fillRect(690, 285, 330, 215);
      ctx.strokeStyle = 'rgba(244, 184, 85, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(690, 285, 330, 215);

      ctx.fillStyle = '#ffd27d';
      ctx.font = '600 18px "DM Sans", sans-serif';
      ctx.fillText('MELA JHOLA MEMORIES', 712, 320);

      ctx.fillStyle = '#fff3d6';
      ctx.font = '500 18px "DM Sans", sans-serif';
      ctx.fillText(`• Balloons Popped: ${stats.balloonsPopped}`, 712, 358);
      ctx.fillText(`• Golden Rings Landed: ${stats.ringsLanded}`, 712, 392);
      ctx.fillText(`• Mandap Diyas Lit: ${stats.diyasLit} / 7`, 712, 426);
      ctx.fillText(`• Souvenirs & Mithai: ${stats.items.length}`, 712, 460);

      // Bottom Footer Banner
      ctx.fillStyle = '#f4b855';
      ctx.font = 'italic 500 26px "Playfair Display", Georgia, serif';
      ctx.fillText(
        '"Iss Diwali, bachpan wale mele ki roshni aur mithaas aapke naam!"',
        56,
        565
      );

      ctx.fillStyle = '#b9a37e';
      ctx.font = '500 17px "DM Sans", sans-serif';
      ctx.fillText(
        `Items collected: ${stats.items.slice(0, 5).join(' · ')}`,
        56,
        615
      );

      setCardDataUrl(canvas.toDataURL('image/png'));
    };
    img.src = snapshotUrl;
  }, [snapshotUrl, visitorName, stats]);

  const handleDownload = () => {
    if (!cardDataUrl) return;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = `diwali-mela-card-${(visitorName || 'friend').toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
    onToast('Downloaded your Diwali Mela Postcard!');
  };

  const handleCopyInvite = () => {
    const url = window.location.origin;
    const text = `Diwali Mela chaloge mere sath? 🪔 Come walk through glowing stalls, eat garam jalebi, ride the giant wheel & watch the 1008 Akashdeep finale with me: ${url}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      onToast('Copied Diwali Mela invitation to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090d18]/85"
      role="dialog"
      aria-modal="true"
      aria-label="Share your Diwali Mela Card"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#131b2e] border border-[#f1aa49]/40 p-6 text-[#f7e7c4] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-xs font-medium tracking-wider text-[#f1aa49] mb-1">
          YOUR DIWALI MELA POSTCARD · SHUBH DEEPAVALI
        </div>
        <h2 className="text-2xl font-display font-semibold text-[#fff5de] mb-2">
          Diwali Mela chaloge mere sath?
        </h2>
        <p className="text-sm text-[#d8c39e] mb-4">
          Send this nostalgic 3D Diwali Mela postcard to someone you want to walk through the lights with.
        </p>

        <canvas ref={canvasRef} className="hidden" />

        {cardDataUrl && (
          <div className="mb-4 rounded-xl overflow-hidden border border-[#f1aa49]/35 bg-[#0d1322]">
            <img
              src={cardDataUrl}
              alt="Generated Diwali Mela Postcard"
              referrerPolicy="no-referrer"
              className="w-full h-auto block"
            />
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-[#e5c99b] mb-1.5">
            YOUR NAME ON THE POSTCARD
          </label>
          <input
            type="text"
            maxLength={32}
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-3.5 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/35 text-sm text-[#fff5de] focus:outline-none focus:border-[#f1aa49]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#f1aa49] text-[#141824] font-semibold text-sm hover:bg-[#ffbe61] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Postcard PNG
          </button>

          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1d2842] border border-[#f1aa49]/35 text-[#fff2d2] font-medium text-sm hover:bg-[#263557] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Invitation Copied!' : 'Copy Invite Link'}
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `Diwali Mela chaloge mere sath? 🪔 Come walk through glowing stalls, play games & watch the 1008 Akashdeep sky lanterns with me: ${window.location.origin}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1d2842] border border-[#f1aa49]/35 text-[#fff2d2] font-medium text-sm hover:bg-[#263557] transition-colors whitespace-nowrap shrink-0"
          >
            <Share2 className="w-4 h-4" />
            Share on WhatsApp ↗
          </a>
        </div>
      </div>
    </div>
  );
};
