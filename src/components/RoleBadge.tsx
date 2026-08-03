import React from "react";
import { Star, Award, Crown, Gem, Shirt } from "lucide-react";
import { RoleId, ROLE_CONFIGS } from "../types.js";

interface RoleBadgeProps {
  roleId: RoleId;
  showGrade?: boolean;
}

export default function RoleBadge({ roleId, showGrade = true }: RoleBadgeProps) {
  const config = ROLE_CONFIGS[roleId];
  if (!config) return null;

  // Render symbol based on config
  const renderSymbol = () => {
    const size = 16;
    switch (config.symbol) {
      case "star":
        return <Star size={size} className="fill-current" />;
      case "cross":
        return <Award size={size} className="fill-current" />;
      case "crown":
        return <Crown size={size} className="fill-current" />;
      case "gem":
        return <Gem size={size} className="fill-current" />;
      default:
        return <Star size={size} className="fill-current" />;
    }
  };

  // Map role config colors to specific Tailwind text and background color combinations
  // Map role config colors to specific Tailwind text and background color combinations for dark mode
  const colorMap: Record<string, { text: string; bg: string; border: string; iconColor: string }> = {
    "amber-400": {
      text: "text-amber-300",
      bg: "bg-amber-400/10",
      border: "border-amber-400/20",
      iconColor: "text-amber-400",
    },
    "amber-700": {
      text: "text-amber-200",
      bg: "bg-amber-700/15",
      border: "border-amber-700/30",
      iconColor: "text-amber-400",
    },
    "orange-400": {
      text: "text-orange-300",
      bg: "bg-orange-400/10",
      border: "border-orange-400/20",
      iconColor: "text-orange-400",
    },
    "orange-600": {
      text: "text-orange-200",
      bg: "bg-orange-600/15",
      border: "border-orange-600/30",
      iconColor: "text-orange-400",
    },
    "pink-400": {
      text: "text-pink-300",
      bg: "bg-pink-400/10",
      border: "border-pink-400/20",
      iconColor: "text-pink-400",
    },
    "pink-600": {
      text: "text-pink-200",
      bg: "bg-pink-600/15",
      border: "border-pink-600/30",
      iconColor: "text-pink-400",
    },
    "rose-600": {
      text: "text-rose-200",
      bg: "bg-rose-600/15",
      border: "border-rose-600/30",
      iconColor: "text-rose-400",
    },
    "purple-600": {
      text: "text-purple-200",
      bg: "bg-purple-600/15",
      border: "border-purple-600/30",
      iconColor: "text-purple-400",
    },
    "violet-700": {
      text: "text-violet-200",
      bg: "bg-violet-700/15",
      border: "border-violet-700/30",
      iconColor: "text-violet-400",
    },
    "red-500": {
      text: "text-red-300",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      iconColor: "text-red-400",
    },
    "red-700": {
      text: "text-red-200",
      bg: "bg-red-700/15",
      border: "border-red-700/30",
      iconColor: "text-red-400",
    },
    "cyan-500": {
      text: "text-cyan-300",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      iconColor: "text-cyan-400",
    },
  };

  const scheme = colorMap[config.color] || {
    text: "text-slate-300",
    bg: "bg-white/5",
    border: "border-white/10",
    iconColor: "text-slate-400",
  };

  return (
    <div
      className={`inline-flex items-center justify-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium leading-none ${scheme.bg} ${scheme.text} ${scheme.border}`}
      id={`role-badge-${roleId}`}
    >
      <span className={`${scheme.iconColor} inline-flex items-center justify-center shrink-0`}>
        {renderSymbol()}
      </span>
      <span className="text-white/10 font-normal leading-none">|</span>
      
      {/* Show uniform lab coat indicator (except for highest tier which might have gem) */}
      <span className="text-slate-500 inline-flex items-center justify-center shrink-0" title="Camice Medico / Ruolo">
        {config.symbol === "gem" ? (
          <Gem size={14} className="text-cyan-400 fill-cyan-400/10" />
        ) : (
          <Shirt size={14} className="text-slate-500 fill-slate-500/15" />
        )}
      </span>
      <span className="text-white/10 font-normal leading-none">|</span>

      <span className="whitespace-nowrap text-center leading-none pt-0.5">{config.name}</span>

      {showGrade && (
        <>
          <span className="text-white/10 font-normal leading-none">•</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-semibold text-slate-400 inline-flex items-center justify-center leading-none">
            Grado {config.grade}
          </span>
        </>
      )}
    </div>
  );
}
