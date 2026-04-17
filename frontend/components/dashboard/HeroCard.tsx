'use client';

import { motion } from 'framer-motion';
import { Play, Plus, Zap } from 'lucide-react';

export function HeroCard() {
  return (
    <section
      className="relative overflow-hidden rounded-[24px] px-10 py-12"
      style={{
        background:
          'radial-gradient(120% 140% at 80% 20%, rgba(255,105,0,0.35) 0%, rgba(187,77,0,0.12) 30%, #1c1917 65%)',
      }}
    >
      {/* Orbiting accent orb */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="pointer-events-none absolute right-16 top-1/2 h-[260px] w-[260px] -translate-y-1/2"
        aria-hidden
      >
        <div className="absolute inset-0 rounded-full border border-dashed border-brand-500/30" />
        <div className="absolute inset-8 rounded-full border border-dashed border-brand-500/20" />
        <motion.div
          animate={{ rotate: [0, 8, -4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-[32px] bg-gradient-to-br from-[#fe9a00] via-[#ff6900] to-[#bb4d00] shadow-[0_30px_60px_-20px_rgba(255,105,0,0.6)]"
        />
        <span className="absolute -left-2 top-2 grid h-10 w-10 place-items-center rounded-2xl bg-[#292524] text-[18px]">
          🧁
        </span>
        <span className="absolute right-0 top-4 grid h-10 w-10 place-items-center rounded-2xl bg-[#292524] text-brand-400">
          <Zap className="h-4 w-4 fill-current" strokeWidth={0} />
        </span>
        <span className="absolute bottom-2 left-12 grid h-10 w-10 place-items-center rounded-2xl bg-[#292524] text-[18px]">
          🧠
        </span>
      </motion.div>

      <div className="relative max-w-[560px]">
        {/* Status chip */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#292524]/80 px-3 py-1.5 text-[12px] font-medium text-brand-100 ring-1 ring-brand-500/30">
          <Zap className="h-3 w-3 fill-current text-brand-400" strokeWidth={0} />
          Orchestrator AI v1.0 Online
        </span>

        {/* Layered title */}
        <h1 className="relative mt-5 font-black tracking-tight text-white">
          <span className="absolute inset-0 translate-x-1 -translate-y-0.5 text-[56px] leading-none text-white/15">
            AI Orchestra
          </span>
          <span className="relative text-[56px] leading-none bg-gradient-to-r from-[#ffb900] via-[#fe9a00] to-[#ff6900] bg-clip-text text-transparent">
            AI Orchestra
          </span>
        </h1>

        <p className="mt-5 text-[15px] leading-[1.55] text-[#d6d3d1]">
          The collaborative platform where multiple leading AI models converse, plan, and
          execute workflows in real-time. Turn isolation into a living symphony.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-gradient-to-b from-brand-400 to-brand-500 px-5 text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_8px_20px_-6px_rgba(255,105,0,0.6)] transition-transform active:scale-[0.98]"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
            New Workflow
          </button>
          <button
            type="button"
            className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-[#292524] px-5 text-[14px] font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-[#3a3733]"
          >
            <Play className="h-4 w-4 fill-current" strokeWidth={0} />
            Join AI Werewolf
          </button>
        </div>
      </div>
    </section>
  );
}
