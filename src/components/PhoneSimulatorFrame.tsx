import React from 'react';
import { Battery, BatteryCharging, Signal } from 'lucide-react';
import { UserProfile } from '../lib/types.js';

interface PhoneSimulatorFrameProps {
  profile: UserProfile;
  children: React.ReactNode;
  isSimulatorMode?: boolean;
  theme: 'day' | 'night';
}

export const PhoneSimulatorFrame: React.FC<PhoneSimulatorFrameProps> = ({
  profile,
  children,
  isSimulatorMode = false,
  theme,
}) => {
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isDay = theme === 'day';

  if (!isSimulatorMode) {
    return <div className="w-full h-full flex flex-col overflow-hidden">{children}</div>;
  }

  return (
    <div
      className={`relative mx-auto w-full max-w-[360px] h-[640px] rounded-[38px] p-2.5 shadow-2xl border-4 transition-colors duration-200 flex flex-col overflow-hidden ${
        isDay
          ? 'bg-slate-200 border-slate-300 shadow-slate-300/60'
          : 'bg-slate-900 border-slate-800 shadow-black/60'
      }`}
    >
      {/* Top Speaker Notch */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-950 rounded-full z-40 flex items-center justify-center gap-1.5">
        <div className="w-8 h-1 bg-slate-700 rounded-full"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
      </div>

      {/* Screen Frame */}
      <div
        className={`relative w-full h-full rounded-[28px] overflow-hidden flex flex-col border shadow-inner ${
          isDay
            ? 'bg-slate-50 border-slate-200'
            : 'bg-[#091326] border-slate-800'
        }`}
      >
        {/* Mobile Status Bar */}
        <div
          className={`h-7 px-4 pt-1 flex items-center justify-between text-[10px] font-semibold select-none z-30 ${
            isDay ? 'text-slate-500 bg-slate-50/95' : 'text-slate-400 bg-[#091326]/95'
          }`}
        >
          <span>{currentTime}</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-2.5 h-2.5 text-slate-400" />
            <span className="text-[9px] uppercase">{profile.network}</span>
            <div className="flex items-center gap-0.5">
              <span className="text-[9px]">{profile.battery}%</span>
              {profile.isCharging ? (
                <BatteryCharging className="w-3 h-3 text-emerald-600" />
              ) : (
                <Battery className="w-3 h-3 text-slate-400" />
              )}
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {children}
        </div>

        {/* Bottom Home Indicator */}
        <div
          className={`h-3 flex items-center justify-center z-30 ${
            isDay ? 'bg-slate-50' : 'bg-[#091326]'
          }`}
        >
          <div className="w-20 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};
