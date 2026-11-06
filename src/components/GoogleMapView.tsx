// Source: Google Maps Platform Code Assist
import React, { useEffect } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { LocationCoordinate, UserRole } from '../lib/types.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { Lock, ShieldAlert } from 'lucide-react';

interface GoogleMapViewProps {
  partnerLocation: LocationCoordinate;
  partnerDisplayName: string;
  isLocked: boolean;
  isEmergency: boolean;
  timeRemainingSeconds: number;
  myRole: UserRole;
  theme: 'day' | 'night';
  isPartnerLoggedOut?: boolean;
}

interface MapCameraSyncProps {
  mapId: string;
  lat: number;
  lng: number;
  zoom: number;
}

const MapCameraSync: React.FC<MapCameraSyncProps> = ({ mapId, lat, lng, zoom }) => {
  const map = useMap(mapId);

  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
    map.setZoom(zoom);
  }, [map, lat, lng, zoom]);

  return null;
};

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  partnerLocation,
  partnerDisplayName,
  isLocked,
  isEmergency,
  myRole,
  theme,
  isPartnerLoggedOut = false,
}) => {
  const isDay = theme === 'day';
  const mapInstanceId = `haven-map-${myRole}`;
  const targetZoom = isEmergency ? 16 : 15;

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden border shadow-sm flex items-center justify-center transition-colors ${
        isDay ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-[#091326]'
      }`}
    >
      {/* Google Maps Viewport */}
      <div
        className={`w-full h-full transition-all duration-500 ${
          isLocked
            ? 'filter blur-[7px] brightness-[0.7] scale-[1.03] pointer-events-none'
            : 'filter-none scale-100'
        }`}
      >
        <Map
          id={mapInstanceId}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={{ lat: partnerLocation.lat, lng: partnerLocation.lng }}
          defaultZoom={targetZoom}
          gestureHandling="greedy"
          disableDefaultUI={true}
          colorScheme={isDay ? 'LIGHT' : 'DARK'}
          style={{ width: '100%', height: '100%' }}
        >
          <MapCameraSync
            mapId={mapInstanceId}
            lat={partnerLocation.lat}
            lng={partnerLocation.lng}
            zoom={targetZoom}
          />
          {!isLocked && (
            <AdvancedMarker position={{ lat: partnerLocation.lat, lng: partnerLocation.lng }}>
              <div className="relative flex items-center justify-center">
                <span
                  className={`animate-ping absolute inline-flex h-9 w-9 rounded-full opacity-75 ${
                    isEmergency ? 'bg-rose-400' : 'bg-[#2DD4BF]'
                  }`}
                ></span>
                <div
                  className={`relative inline-flex items-center justify-center rounded-full h-7 w-7 border-2 border-white shadow-lg text-white font-bold text-xs ${
                    isEmergency
                      ? 'bg-rose-600'
                      : 'bg-gradient-to-tr from-[#3B82F6] to-[#2DD4BF]'
                  }`}
                >
                  {isEmergency ? 'SOS' : '📍'}
                </div>
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </div>

      {/* Resting overlay when not actively viewed */}
      {isLocked && (
        <div
          className={`absolute inset-0 z-20 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center select-none animate-fadeIn ${
            isDay ? 'bg-slate-50/80 text-slate-900' : 'bg-[#091326]/85 text-slate-100'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-2xl border shadow-sm flex items-center justify-center mb-2 ${
              isDay
                ? 'bg-white border-blue-100 text-blue-600 shadow-blue-500/5'
                : 'bg-slate-900 border-slate-800 text-[#2DD4BF]'
            }`}
          >
            {isPartnerLoggedOut ? (
              <Lock className="w-5 h-5 text-slate-400" />
            ) : (
              <HavenLogoIcon size={24} />
            )}
          </div>

          <h3 className="text-base font-bold tracking-tight px-2 text-center truncate max-w-[240px] font-['JetBrains_Mono',monospace]">
            {partnerDisplayName}
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[210px] px-2 text-center truncate font-['Inter',sans-serif]">
            {isPartnerLoggedOut ? 'Offline' : (partnerLocation.address || partnerLocation.city || 'Standby')}
          </p>

          <span className="text-[10px] text-slate-400 mt-1.5 font-mono">
            Last seen: {new Date(partnerLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Active Location Banner (Spacious, zero overlap, no time constraints) */}
      {!isLocked && !isEmergency && (
        <div
          className={`absolute top-2.5 left-2.5 right-2.5 z-30 px-3.5 py-2.5 rounded-xl shadow-md border flex items-center gap-2.5 text-xs font-medium animate-slideDown ${
            isDay
              ? 'bg-white/95 border-blue-200 text-slate-900 shadow-blue-500/5'
              : 'bg-[#091326]/95 border-blue-800/80 text-slate-100'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#2DD4BF] animate-pulse shrink-0"></span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-xs text-[#3B82F6] dark:text-[#2DD4BF] truncate font-['JetBrains_Mono',monospace]">
              {partnerDisplayName}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-['Inter',sans-serif]">
              {partnerLocation.address || partnerLocation.city || 'Reported spot'}
            </div>
          </div>
        </div>
      )}

      {/* Emergency Active Banner */}
      {!isLocked && isEmergency && (
        <div className="absolute top-2.5 left-2.5 right-2.5 z-30 px-3.5 py-2 rounded-xl shadow-lg bg-rose-900 border border-rose-700 text-white flex items-center justify-between text-xs font-bold animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-300" />
            <span>Urgent alert active</span>
          </div>
        </div>
      )}
    </div>
  );
};
