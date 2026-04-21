'use client';

import { motion } from 'framer-motion';
import { Play, Plus, Sparkles, Zap } from 'lucide-react';

export function HeroCard() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="texture-grain relative overflow-hidden rounded-[24px] px-10 py-14 shadow-overlay"
      style={{
        background:
          'radial-gradient(110% 130% at 85% 15%, rgba(255,159,46,0.42) 0%, rgba(255,105,0,0.18) 25%, rgba(28,17,9,1) 62%)',
      }}
    >
      {/* Ambient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -bottom-24 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,105,0,0.55) 0%, transparent 60%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-40 -top-10 h-[220px] w-[220px] rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,204,128,0.45) 0%, transparent 60%)' }}
      />

      {/* Orbiting accent composition */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
        className="pointer-events-none absolute right-14 top-1/2 h-[300px] w-[300px] -translate-y-1/2"
        aria-hidden
      >
        {/* orbit rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-dashed border-brand-400/25"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 55, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-10 rounded-full border border-dashed border-brand-300/20"
        />

        {/* centerpiece cube */}
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [12, 14, 12] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rotate-12 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ffcc80] via-[#ff9f2e] via-55% to-[#b44900] shadow-[0_40px_80px_-20px_rgba(255,105,0,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
        >
          <span className="absolute inset-0 animate-sheen" />
          <span
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.65) 0%, transparent 45%)' }}
          />
        </motion.div>

        {/* orbiting chips */}
        <motion.span
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-2 top-2 grid h-11 w-11 place-items-center rounded-2xl bg-[#2a221a] text-[18px] shadow-elevated ring-1 ring-white/10"
        >
          🧁
        </motion.span>
        <motion.span
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          className="absolute right-2 top-6 grid h-11 w-11 place-items-center rounded-2xl bg-[#2a221a] text-brand-300 shadow-elevated ring-1 ring-white/10"
        >
          <Zap className="h-4 w-4 fill-current" strokeWidth={0} />
        </motion.span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
          className="absolute bottom-4 left-12 grid h-11 w-11 place-items-center rounded-2xl bg-[#2a221a] text-[18px] shadow-elevated ring-1 ring-white/10"
        >
          🧠
        </motion.span>
      </motion.div>

      <div className="relative max-w-[580px]">
        {/* Status chip */}
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2a221a]/85 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-brand-200 ring-1 ring-brand-500/30 backdrop-blur"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-brand-300/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          Orchestrator v1.0 · Online
        </motion.span>

        {/* Layered title */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative mt-6 font-black tracking-tight text-white"
        >
          <span className="absolute inset-0 translate-x-1 -translate-y-0.5 text-[60px] leading-[1.02] text-white/10">
            AI Orchestra
          </span>
          <span className="relative text-[60px] leading-[1.02] text-gradient-brand">
            AI Orchestra
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-5 max-w-[520px] text-[15px] leading-[1.6] text-[#e6dcc9]"
        >
          The collaborative platform where multiple leading AI models converse, plan, and
          execute workflows in real time. Turn isolated prompts into a living symphony.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <button
            type="button"
            className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 px-5 text-[14px] font-semibold text-white shadow-brand-glow transition-all hover:-translate-y-[1px] hover:shadow-brand-glow-hover active:scale-[0.98] focus-ring"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <Plus className="relative h-[18px] w-[18px]" strokeWidth={2.4} />
            <span className="relative">New Workflow</span>
          </button>
          <button
            type="button"
            className="group inline-flex h-12 items-center gap-2 rounded-xl bg-[#2a221a]/95 px-5 text-[14px] font-semibold text-white ring-1 ring-white/10 backdrop-blur transition-all hover:bg-[#3a2f22] hover:-translate-y-[1px] focus-ring"
          >
            <Play className="h-4 w-4 fill-current text-brand-300" strokeWidth={0} />
            Join AI Werewolf
            <Sparkles className="h-3.5 w-3.5 text-brand-300 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />
          </button>
        </motion.div>
      </div>
    </motion.section>
  );
}
