import { useEffect, useMemo, useRef, useState } from 'react'
import { donationPartsByBuilding, tiers } from './data/donationParts.js'
import { zones } from './data/zones.js'
import {
  fetchDonations,
  insertDonation,
  uploadReceipt,
  subscribeNewDonations,
} from './lib/donations.js'
import Hero from './components/Hero.jsx'
import ProgressPanel from './components/ProgressPanel.jsx'
import DonationTiers from './components/DonationTiers.jsx'
import DonorList from './components/DonorList.jsx'
import DonationForm from './components/DonationForm.jsx'
import TransferModal from './components/TransferModal.jsx'

// Meta total mostrada (ajustable, independiente del costo real de las piezas).
const DISPLAY_GOAL = 6_000_000

const LAST_ZONE_KEY = 'pon-tu-ladrillo-tp:lastZone'

// Lee la zona del path actual (/san-rafael, /sanrafael, etc.).
// Acepta tanto el slug con dashes como sin dashes.
function getZoneFromUrl() {
  if (typeof window === 'undefined') return null
  const raw = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!raw) return null
  const exact = zones.find((z) => z.id === raw)
  if (exact) return exact.id
  const stripped = raw.replace(/[-_\s]/g, '')
  const fuzzy = zones.find(
    (z) => z.id.replace(/[-_\s]/g, '') === stripped
  )
  return fuzzy ? fuzzy.id : null
}

// Zona inicial: 1) URL  2) localStorage (última)  3) san-rafael por default
// Si la URL no matchea una zona válida, caemos en san-rafael (no en preview-salon).
function loadInitialZone() {
  const fromUrl = getZoneFromUrl()
  if (fromUrl) return fromUrl
  if (typeof window === 'undefined') return 'san-rafael'
  try {
    const saved = window.localStorage.getItem(LAST_ZONE_KEY)
    if (saved && zones.some((z) => z.id === saved)) return saved
  } catch {
    // ignore
  }
  return 'san-rafael'
}

export default function App() {
  const [selectedZoneId, setSelectedZoneId] = useState(loadInitialZone)
  const [donors, setDonors] = useState([])
  const [selectedTierId, setSelectedTierId] = useState(null)
  const [preferredPartId, setPreferredPartId] = useState(null)
  const [flashPartId, setFlashPartId] = useState(null)
  const [pendingDonation, setPendingDonation] = useState(null)
  const formRef = useRef(null)

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0]
  const buildingType = selectedZone.building || 'salon'

  // Piezas del edificio según la zona seleccionada
  const donationParts = useMemo(
    () =>
      donationPartsByBuilding[buildingType] ||
      donationPartsByBuilding.salon,
    [buildingType]
  )

  // Cargar donaciones de la zona seleccionada + suscribirse a nuevas en vivo
  useEffect(() => {
    let cancelled = false
    setDonors([])
    fetchDonations(selectedZoneId).then((data) => {
      if (!cancelled) setDonors(data)
    })
    const unsubscribe = subscribeNewDonations(selectedZoneId, (newDonor) => {
      setDonors((prev) =>
        prev.some((d) => d.id === newDonor.id) ? prev : [newDonor, ...prev]
      )
    })
    try {
      window.localStorage.setItem(LAST_ZONE_KEY, selectedZoneId)
    } catch {
      // ignore
    }
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [selectedZoneId])

  // Al cambiar zona, resetear UI relevante + actualizar URL
  const handleZoneChange = (newZoneId) => {
    if (newZoneId === selectedZoneId) return
    setSelectedZoneId(newZoneId)
    setSelectedTierId(null)
    setPreferredPartId(null)
    setFlashPartId(null)
    setPendingDonation(null)
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState(
          { zoneId: newZoneId },
          '',
          `/${newZoneId}`
        )
      } catch {
        // ignore
      }
    }
  }

  // Sincronizar zona cuando el usuario usa back/forward del navegador
  useEffect(() => {
    const onPop = () => {
      const id = getZoneFromUrl()
      if (id && id !== selectedZoneId) setSelectedZoneId(id)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectedZoneId])

  const isPreviewZone = !!selectedZone?.isPreviewComplete

  const partsWithStatus = useMemo(() => {
    const donationsByPart = new Map()
    donors.forEach((d) => {
      if (!donationsByPart.has(d.partId)) donationsByPart.set(d.partId, [])
      donationsByPart.get(d.partId).push(d)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return donationParts.map((part) => {
      // En zonas demo "Vista previa" o en piezas marcadas isPreviewOnly,
      // todas las piezas se ven al 100% pero NO cuentan como dinero.
      if (part.isPreviewOnly || isPreviewZone) {
        return {
          ...part,
          donations: [],
          donor: null,
          fundedAmount: part.price,
          cappedAmount: 0,
          fundedPercent: 100,
          donated: true,
        }
      }
      const partDonations = donationsByPart.get(part.id) || []
      const fundedAmount = partDonations.reduce(
        (s, d) => s + (d.amount || 0),
        0
      )
      const cappedAmount = Math.min(part.price, fundedAmount)
      const fundedPercent =
        part.price > 0 ? Math.min(100, (fundedAmount / part.price) * 100) : 0
      return {
        ...part,
        donations: partDonations,
        donor: partDonations[0] || null,
        fundedAmount,
        cappedAmount,
        fundedPercent,
        donated: fundedAmount >= part.price,
      }
    })
  }, [donors, donationParts, isPreviewZone])

  const stats = useMemo(() => {
    // En zonas Vista Previa mostramos las stats como si estuviera completo
    if (isPreviewZone) {
      const realParts = partsWithStatus.filter((p) => !p.isPreviewOnly)
      return {
        raised: DISPLAY_GOAL,
        goal: DISPLAY_GOAL,
        donorsCount: 0,
        donatedParts: realParts.length,
        totalParts: realParts.length,
        percent: 100,
      }
    }
    const raised = donors.reduce((sum, d) => sum + (d.amount || 0), 0)
    const realParts = partsWithStatus.filter((p) => !p.isPreviewOnly)
    const donatedParts = realParts.filter((p) => p.donated).length
    const totalParts = realParts.length
    return {
      raised,
      goal: DISPLAY_GOAL,
      donorsCount: donors.length,
      donatedParts,
      totalParts,
      percent: Math.min(100, Math.round((raised / DISPLAY_GOAL) * 100)),
    }
  }, [donors, partsWithStatus, isPreviewZone])

  const handleSelectTier = (tierId, opts = {}) => {
    setSelectedTierId(tierId)
    if (opts.scroll && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const findStartingPart = (
    tierId,
    { isCompany = false, preferredId = null } = {}
  ) => {
    if (preferredId) {
      const preferred = partsWithStatus.find(
        (p) =>
          p.id === preferredId &&
          p.tier === tierId &&
          p.fundedPercent < 100 &&
          !p.isPreviewOnly &&
          !(isCompany && p.excludeCompanyLogo)
      )
      if (preferred) return preferred
    }
    return partsWithStatus.find(
      (p) =>
        p.tier === tierId &&
        p.fundedPercent < 100 &&
        !p.isPreviewOnly &&
        !(isCompany && p.excludeCompanyLogo)
    )
  }

  const handleRegisterDonation = ({
    name,
    message,
    amount,
    tierId,
    isCompany,
    logoFile,
  }) => {
    return new Promise((resolve, reject) => {
      if (!tierId) {
        reject(new Error('Tier inválido'))
        return
      }
      const target = findStartingPart(tierId, {
        isCompany: !!isCompany,
        preferredId: preferredPartId,
      })
      if (!target) {
        reject(new Error('No hay piezas disponibles'))
        return
      }
      const numericAmount = Number(amount)
      if (!numericAmount || numericAmount <= 0) {
        reject(new Error('Monto inválido'))
        return
      }
      setPendingDonation({
        name,
        message,
        amount: numericAmount,
        isCompany: !!isCompany,
        logoFile: logoFile || null,
        targetPart: target,
        resolve,
        reject,
      })
    })
  }

  // Reparte un monto entre piezas del mismo tier hasta agotarlo.
  const planSpillover = (startPart, amount) => {
    const chunks = []
    let amountLeft = amount
    const sameTier = partsWithStatus.filter(
      (p) => p.tier === startPart.tier && !p.isPreviewOnly
    )
    const orderedParts = [
      startPart,
      ...sameTier.filter((p) => p.id !== startPart.id),
    ]
    for (const part of orderedParts) {
      if (amountLeft <= 0) break
      const fundedSoFar = part.fundedAmount || 0
      const remaining = Math.max(0, part.price - fundedSoFar)
      if (remaining <= 0) continue
      const take = Math.min(amountLeft, remaining)
      chunks.push({ partId: part.id, amount: take })
      amountLeft -= take
    }
    if (amountLeft > 0) {
      if (chunks.length > 0) {
        chunks[chunks.length - 1].amount += amountLeft
      } else {
        chunks.push({ partId: startPart.id, amount: amountLeft })
      }
    }
    return chunks
  }

  const handleConfirmTransfer = async ({
    receiptFile,
    firstName,
    lastName,
    rut,
  }) => {
    const pd = pendingDonation
    if (!pd) return
    try {
      // 1) Subir comprobante UNA sola vez (toda la donación lo comparte)
      const receiptUrl = receiptFile ? await uploadReceipt(receiptFile) : null

      // 2) Calcular reparto del monto entre piezas del tier
      const chunks = planSpillover(pd.targetPart, pd.amount)
      const savedAll = []
      const baseDonor = {
        name: pd.name,
        message: pd.message,
        isCompany: pd.isCompany,
        transferFirstName: firstName,
        transferLastName: lastName,
        transferRut: rut,
        receiptUrl,
      }

      // 3) Insertar una fila por chunk
      for (const c of chunks) {
        const saved = await insertDonation(selectedZoneId, {
          ...baseDonor,
          partId: c.partId,
          amount: c.amount,
        })
        savedAll.push(saved)
      }

      // 4) Update estado local (Realtime también los traerá, pero evitamos dup)
      setDonors((prev) => {
        const news = savedAll.filter(
          (s) => !prev.some((p) => p.id === s.id)
        )
        return news.length ? [...news, ...prev] : prev
      })

      // 5) Flash + scroll al modelo
      setFlashPartId(pd.targetPart.id)
      setTimeout(() => {
        const el = document.getElementById('modelo')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      setTimeout(() => setFlashPartId(null), 5000)

      pd.resolve(savedAll[0])
      setPendingDonation(null)
      setPreferredPartId(null)
    } catch (err) {
      console.error('[App] No se pudo registrar la donación:', err)
      if (typeof window !== 'undefined') {
        window.alert(
          'No se pudo registrar tu aporte. Verifica tu conexión e intenta de nuevo.'
        )
      }
      throw err
    }
  }

  const handleCancelTransfer = () => {
    if (pendingDonation) {
      pendingDonation.reject(new Error('Cancelado'))
      setPendingDonation(null)
      setPreferredPartId(null)
    }
  }

  const scrollToForm = () => {
    if (formRef.current)
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToTiers = () => {
    const el = document.getElementById('tiers')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen pb-20">
      <Header onDonateClick={scrollToForm} />

      <main className="space-y-24">
        <Hero
          zones={zones}
          selectedZoneId={selectedZoneId}
          onZoneChange={handleZoneChange}
          selectedZone={selectedZone}
          buildingType={buildingType}
          stats={stats}
          parts={partsWithStatus}
          flashPartId={flashPartId}
          flashPart={
            flashPartId
              ? partsWithStatus.find((p) => p.id === flashPartId)
              : null
          }
          onDonateClick={scrollToForm}
          onViewParts={scrollToTiers}
          onPartClick={(part) => {
            setPreferredPartId(part.id)
            handleSelectTier(part.tier, { scroll: true })
          }}
        />

        <section className="tp-section">
          <ProgressPanel stats={stats} buildingType={buildingType} />
        </section>

        <section id="tiers" className="tp-section">
          <SectionHeader
            eyebrow="Categorías de aporte"
            title="Elige cómo quieres aportar"
            subtitle={
              <>
                Cada categoría tiene un costo total.{' '}
                <span className="text-tp-red font-semibold">
                  Puedes aportar la pieza entera o un porcentaje
                </span>{' '}
                — cada peso suma.
              </>
            }
          />
          <div className="mt-8">
            <DonationTiers
              tiers={tiers}
              parts={partsWithStatus}
              onPickTier={(tierId) => {
                setPreferredPartId(null)
                handleSelectTier(tierId, { scroll: true })
              }}
            />
          </div>
        </section>

        <section className="tp-section space-y-10">
          <div ref={formRef}>
            <SectionHeader
              eyebrow="Quiero aportar"
              title={`Pon tu ladrillo · ${selectedZone.name}`}
              subtitle="Elige qué quieres aportar, ingresa el monto y tu nombre quedará marcado en el modelo."
              compact
            />
            <div className="mt-6">
              <DonationForm
                tiers={tiers}
                parts={partsWithStatus}
                selectedTierId={selectedTierId}
                preferredPartId={preferredPartId}
                onSelectTier={(tierId) => {
                  setPreferredPartId(null)
                  setSelectedTierId(tierId)
                }}
                onSubmit={handleRegisterDonation}
              />
            </div>
          </div>

          <div>
            <SectionHeader
              eyebrow="Últimos donantes"
              title="Quienes ya pusieron su ladrillo"
              subtitle={`Aportes en ${selectedZone.name}.`}
              compact
            />
            <div className="mt-6">
              <DonorList donors={donors} parts={partsWithStatus} limit={12} />
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {pendingDonation && (
        <TransferModal
          donation={pendingDonation}
          onConfirm={handleConfirmTransfer}
          onCancel={handleCancelTransfer}
          buildingType={buildingType}
        />
      )}
    </div>
  )
}

function Header({ onDonateClick }) {
  return (
    <header className="tp-section flex items-center justify-between pt-2 pb-2 sm:pt-3 sm:pb-3">
      <a href="#" className="flex items-center gap-6">
        <img
          src="/logotp.png"
          alt="Trabajo País 2026"
          className="h-28 sm:h-36 w-auto"
        />
        <span className="hidden sm:block h-20 w-px bg-stone-300" />
        <span className="hidden sm:inline-flex flex-col leading-tight">
          <span className="text-sm uppercase tracking-[0.22em] text-slate-500 font-semibold">
            Campaña
          </span>
          <span className="font-display text-3xl sm:text-4xl font-extrabold text-tp-blue-dark mt-1">
            Pon tu ladrillo
          </span>
          <span className="inline-flex items-center gap-1.5 mt-1.5 text-tp-red text-sm font-bold uppercase tracking-[0.18em]">
            Trabajo País 2026
          </span>
        </span>
      </a>
      <div className="flex items-center gap-3">
        <button
          onClick={onDonateClick}
          className="tp-btn-primary text-lg py-3.5 px-7"
        >
          Quiero donar
        </button>
      </div>
    </header>
  )
}

function SectionHeader({ eyebrow, title, subtitle, compact }) {
  return (
    <div className={compact ? '' : 'max-w-2xl'}>
      <span className="tp-eyebrow">{eyebrow}</span>
      <h2 className="font-display text-3xl sm:text-4xl font-bold text-tp-blue-dark mt-2">
        {title}
      </h2>
      {subtitle && (
        <p className="text-slate-600 mt-3 text-base sm:text-lg">{subtitle}</p>
      )}
    </div>
  )
}

function Footer() {
  return (
    <footer className="tp-section mt-24 border-t border-stone-200 pt-8 text-sm text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/logotp.png" alt="Trabajo País 2026" className="h-10 w-auto" />
        <p>
          Campaña <strong className="text-tp-blue-dark">Pon tu ladrillo</strong> ·{' '}
          <span className="text-tp-blue-dark font-semibold">Trabajo País 2026</span>
        </p>
      </div>
    </footer>
  )
}
