// Source: Google Maps Platform Code Assist
import React, { useEffect } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { LocationCoordinate, UserRole } from '../lib/types.js';
import { buildGoogleMapsUrl, getDisplayLocationText } from '../lib/locationUtils.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { ExternalLink, Lock, MapPin, ShieldAlert } from 'lucide-react';

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
  const displayLoc = getDisplayLocationText(partnerLocation);
  const googleMapsUrl = buildGoogleMapsUrl(
    partnerLocation.lat,
    partnerLocation.lng,
    partnerLocation.placeId
  );

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
                  {isEmergency ? 'SOS' : <MapPin className="w-3.5 h-3.5" />}
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

          <h3 className="text-base font-bold tracking-tight px-2 text-center truncate max-w-full font-['JetBrains_Mono',monospace]">
            {partnerDisplayName}
          </h3>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-full px-3 text-center leading-snug line-clamp-2 font-['Inter',sans-serif]">
            {isPartnerLoggedOut ? 'Offline' : displayLoc.primary}
          </p>

          {!isPartnerLoggedOut && displayLoc.secondary && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-full px-3">
              {displayLoc.secondary}
            </p>
          )}

          <span className="text-[10px] text-slate-400 mt-1.5 font-mono">
            Last seen: {new Date(partnerLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Active Google Maps Location Banner */}
      {!isLocked && !isEmergency && (
        <div
          className={`absolute top-2.5 left-2.5 right-2.5 z-30 px-3 py-2 rounded-xl shadow-md border text-xs font-medium animate-slideDown space-y-1 ${
            isDay
              ? 'bg-white/95 border-blue-200 text-slate-900 shadow-blue-500/5'
              : 'bg-[#091326]/95 border-blue-800/80 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse shrink-0"></span>
              <span className="font-bold text-xs text-[#3B82F6] dark:text-[#2DD4BF] truncate font-['JetBrains_Mono',monospace]">
                {partnerDisplayName}
              </span>
            </div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shrink-0 transition ${
                isDay
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-blue-950/60 border-blue-800 text-[#2DD4BF] hover:bg-blue-900/60'
              }`}
              aria-label={`Open ${partnerDisplayName}'s location in Google Maps`}
            >
              <span>Maps</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="text-[11px] font-medium leading-snug line-clamp-2 font-['Inter',sans-serif]">
            {displayLoc.primary}
          </div>
          {displayLoc.secondary && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-['Inter',sans-serif]">
              {displayLoc.secondary}
            </div>
          )}
        </div>
      )}

      {/* Emergency Active Banner */}
      {!isLocked && isEmergency && (
        <div className="absolute top-2.5 left-2.5 right-2.5 z-30 px-3 py-2 rounded-xl shadow-lg bg-rose-900/95 border border-rose-700 text-white flex items-center justify-between gap-2 text-xs font-bold">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 animate-pulse" />
              <span className="truncate">Urgent alert active</span>
            </div>
            <div className="text-[10px] font-normal text-rose-100 truncate mt-0.5">
              {displayLoc.primary}
              {displayLoc.secondary ? ` · ${displayLoc.secondary}` : ''}
            </div>
          </div>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[10px] font-semibold flex items-center gap-1 shrink-0 transition"
            aria-label="Open urgent location in Google Maps"
          >
            <span>Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
