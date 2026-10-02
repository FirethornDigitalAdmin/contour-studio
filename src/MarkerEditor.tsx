import { centreLongitude, insideBounds } from "./world";
import { useState } from "react";
import { Heart, Plus, ChevronDown, MapPin, Trash2, Copy, Star } from "lucide-react";
import type { LocationMarker, Settings } from "./types";
import { Field, NumberField } from "./Controls";
import { markerFitsMap } from "./validation";
const symbolIcons = { heart: Heart, star: Star, pin: MapPin };
function MarkerSymbol({ symbol, size }: { symbol: LocationMarker["symbol"]; size: number }) {
  const Icon = symbolIcons[symbol];
  return <Icon size={size} />;
}
export const symbols = { heart: "♥", star: "★", pin: "●" };
export default function MarkerEditor({
  settings,
  onChange,
  placing,
  onPlace,
}: {
  settings: Settings;
  onChange: (markers: LocationMarker[]) => void;
  placing: string | null;
  onPlace: (id: string | null) => void;
}) {
  const markers = settings.markers;
  const [expanded, setExpanded] = useState<string | null>(null);
  function update(id: string, values: Partial<LocationMarker>) {
    onChange(markers.map((m) => (m.id === id ? { ...m, ...values } : m)));
  }
  function centre(id: string) {
    update(id, { lon: centreLongitude(settings.bounds), lat: (settings.bounds.south + settings.bounds.north) / 2 });
    if (placing === id) onPlace(null);
  }
  function markerNearEdge(marker: LocationMarker) {
    return !markerFitsMap(marker, settings);
  }
  return (
    <div className="marker-editor">
      {markers.length === 0 && (
        <div className="marker-empty">
          <Heart size={22} strokeWidth={1.5} />
          <p>
            A home, a first date, a favourite spot.
            <br />
            Add a raised symbol to your map.
          </p>
        </div>
      )}
      {markers.map((marker, i) => {
        const open = expanded === marker.id || placing === marker.id;
        const outside =
          !insideBounds(marker.lon,marker.lat,settings.bounds);
        const nearEdge = !outside && markerNearEdge(marker);
        return (
          <div
            className={`marker-card ${open ? "expanded" : ""} ${outside || nearEdge ? "needs-position" : ""}`}
            key={marker.id}
          >
            <button
              type="button"
              className="marker-heading"
              aria-expanded={open}
              aria-controls={`marker-${marker.id}`}
              onClick={() => {
                if (placing === marker.id) onPlace(null);
                setExpanded(open ? null : marker.id);
              }}
            >
              <span className="marker-symbol" aria-hidden="true"><MarkerSymbol symbol={marker.symbol} size={19} /></span>
              <span>
                <strong>{marker.label || `Place ${i + 1}`}</strong>
                <small>
                  {placing === marker.id ? "Choose a point on the map" : outside ? "Outside selected area" : nearEdge ? "Close to the map edge" : `${marker.size} mm symbol · ${marker.rise} mm rise`}
                </small>
              </span>
              <ChevronDown size={16} />
            </button>
            {open && (
              <div className="marker-body" id={`marker-${marker.id}`}>
                <Field label="Place name" hint={!marker.label.trim() ? "Give this place a name before generating your model." : undefined} hintId={`marker-name-hint-${marker.id}`}>
                  <input
                    aria-label={`Place ${i + 1} name`}
                    aria-invalid={!marker.label.trim() || undefined}
                    aria-describedby={!marker.label.trim() ? `marker-name-hint-${marker.id}` : undefined}
                    value={marker.label}
                    maxLength={64}
                    required
                    onChange={(e) =>
                      update(marker.id, { label: e.target.value })
                    }
                  />
                </Field>
                <p className="marker-coordinates">{marker.lat.toFixed(6)}°, {marker.lon.toFixed(6)}°</p>
                <div
                  className="symbol-picker"
                  role="group"
                  aria-label={`Place ${i + 1} symbol`}
                >
                  {(
                    [
                      ["heart", "Heart"],
                      ["star", "Star"],
                      ["pin", "Pin"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={marker.symbol === value}
                      onClick={() => update(marker.id, { symbol: value })}
                    >
                      <span aria-hidden="true"><MarkerSymbol symbol={value} size={16} /></span>
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="place-marker-button"
                  type="button"
                  aria-pressed={placing === marker.id}
                  onClick={() =>
                    onPlace(placing === marker.id ? null : marker.id)
                  }
                >
                  <MapPin size={16} />
                  {placing === marker.id ? "Cancel placement" : "Choose on map"}
                </button>
                {placing === marker.id && <p className="marker-placement-note" role="status">Click or tap inside the selected area to place this symbol. Leave room around its edges. Press Escape to cancel.</p>}
                <details className="advanced">
                  <summary>Symbol size & position</summary>
                  <div className="two-col">
                    {(
                      [
                        ["size", "Symbol size · mm", 3, 30, 0.5],
                        ["rise", "Rise above surface · mm", 0.5, 20, 0.5],
                        ["lat", "Latitude", -90, 90, 0.000001],
                        ["lon", "Longitude", -180, 180, 0.000001],
                      ] as const
                    ).map(([key, label, min, max, step]) => (
                      <NumberField
                        key={key}
                        label={label}
                        ariaLabel={`Place ${i + 1} ${label}`}
                        value={marker[key]}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(value) =>
                          update(marker.id, { [key]: value })
                        }
                      />
                    ))}
                  </div>
                </details>
                {(outside || nearEdge) && <div className="settings-feedback" role="status">
                  <p>{outside ? "Move this symbol inside your selected area before generating." : "The whole printed symbol must fit inside the map. Move it inward or choose a smaller size."}</p>
                  <button type="button" className="marker-recentre" onClick={() => centre(marker.id)}>Move to map centre</button>
                </div>}
                <div className="marker-actions">
                  <button type="button" className="duplicate-marker" disabled={markers.length >= 20}
                    aria-label={`Duplicate place ${i + 1}`} title={markers.length >= 20 ? "Remove a place to add another. The limit is 20." : "Duplicate this symbol and choose a new position."} onClick={() => {
                      const id = crypto.randomUUID();
                      onChange([...markers, { ...marker, id, label: `${marker.label || "Place"} copy`.slice(0, 64),
                        lon: centreLongitude(settings.bounds),
                        lat: (settings.bounds.south + settings.bounds.north) / 2 }]);
                      setExpanded(id);
                      onPlace(id);
                    }}><Copy size={13} />Duplicate</button>
                  <button
                  type="button"
                  className="remove-marker"
                  aria-label={`Remove place ${i + 1}`}
                  onClick={() => {
                    onChange(markers.filter((m) => m.id !== marker.id));
                    if (placing === marker.id) onPlace(null);
                    setExpanded(null);
                  }}
                >
                  <Trash2 size={14} />
                  Remove place
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        className="add-marker"
        type="button"
        disabled={markers.length >= 20}
        onClick={() => {
          const id = crypto.randomUUID();
          onChange([
            ...markers,
            {
              id,
              label: `Special place ${markers.length + 1}`,
              symbol: "heart",
              lon: centreLongitude(settings.bounds),
              lat: (settings.bounds.south + settings.bounds.north) / 2,
              size: 8,
              rise: 3,
            },
          ]);
          setExpanded(id);
          onPlace(id);
        }}
      >
        <Plus size={17} />
        {markers.length >= 20 ? "All 20 places added" : "Add a special place"}
      </button>
      <small className="hint">
        {markers.length ? `${markers.length} of 20 places. ` : ""}Symbols are
        printed; place names are only labels here.
      </small>
    </div>
  );
}
