import { useEffect, useMemo, useRef, useState } from 'react'

// ────────────────────────────────────────────────────────────────────────────
// ZoneSelector — combobox con búsqueda libre + lista filtrada.
// - Click en el input → abre el dropdown
// - Escribir → filtra
// - Click en opción / Enter → selecciona y cierra
// - Esc o click fuera → cierra
// ────────────────────────────────────────────────────────────────────────────

export default function ZoneSelector({ zones, selectedZoneId, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null

  // Cuando cambia el seleccionado desde fuera, refrescamos el texto del input.
  useEffect(() => {
    if (selectedZone && !open) {
      setQuery(selectedZone.name)
    }
  }, [selectedZoneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click fuera → cerrar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        // restaurar texto al seleccionado actual si quedó vacío/cambiado
        if (selectedZone) setQuery(selectedZone.name)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedZone])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === selectedZone?.name?.toLowerCase()) return zones
    return zones.filter((z) => z.name.toLowerCase().includes(q))
  }, [query, zones, selectedZone])

  const handleSelect = (zone) => {
    onSelect(zone.id)
    setQuery(zone.name)
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      if (selectedZone) setQuery(selectedZone.name)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <label className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1.5 inline-block">
        Zona Trabajo País
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlightIdx(0)
          }}
          onFocus={() => {
            setOpen(true)
            setHighlightIdx(0)
            // seleccionar todo el texto para que sea fácil reemplazarlo
            setTimeout(() => inputRef.current?.select(), 10)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar o seleccionar una zona…"
          className="tp-input pr-10 font-display font-bold text-lg sm:text-xl text-tp-blue-dark"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          ▾
        </span>
      </div>

      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-stone-300 bg-white shadow-tp-card">
          {filtered.length === 0 ? (
            <li className="p-3 text-sm text-slate-500 text-center">
              Sin coincidencias
            </li>
          ) : (
            filtered.map((zone, i) => {
              const active = zone.id === selectedZoneId
              const highlighted = i === highlightIdx
              return (
                <li key={zone.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightIdx(i)}
                    onClick={() => handleSelect(zone)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      highlighted ? 'bg-tp-blue/10' : ''
                    } ${active ? 'font-bold text-tp-blue-dark' : 'text-slate-700'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-tp-red text-base">📍</span>
                      <span>{zone.name}</span>
                      {active && (
                        <span className="ml-auto text-tp-red text-xs">
                          ✓ seleccionada
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
