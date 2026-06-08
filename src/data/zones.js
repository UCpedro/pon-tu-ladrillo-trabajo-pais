// ────────────────────────────────────────────────────────────────────────────
// 26 zonas de Trabajo País 2026.
// Cada zona tiene su propio salón/capilla independiente.
// El `id` se usa como clave en localStorage.
// El `building` ('salon' | 'capilla') determina qué modelo 3D se renderiza.
// ────────────────────────────────────────────────────────────────────────────

export const zones = [
  // Zonas demo — muestran el modelo completo (NO son donables)
  {
    id: 'preview-salon',
    name: '⭐ Vista previa salón',
    building: 'salon',
    isPreviewComplete: true,
  },
  {
    id: 'preview-capilla',
    name: '⭐ Vista previa capilla',
    building: 'capilla',
    isPreviewComplete: true,
  },
  // Zona genérica para donar cuando no se sabe a qué zona específica
  { id: 'zona-comun', name: 'Zona Común', building: 'capilla' },
  { id: 'la-gruta', name: 'La Gruta', building: 'capilla' },
  { id: 'pantanillo', name: 'Pantanillo', building: 'salon' },
  { id: 'allipen', name: 'Allipén', building: 'salon' },
  { id: 'nuevo-reino', name: 'Nuevo Reino', building: 'capilla' },
  { id: 'pangue-abajo', name: 'Pangue Abajo', building: 'salon' },
  { id: 'la-conchina', name: 'La Conchina', building: 'capilla' },
  { id: 'las-canas', name: 'Las Cañas', building: 'capilla' },
  { id: 'guayacan', name: 'Guayacán', building: 'salon' },
  { id: 'lefincul', name: 'Lefincul', building: 'salon' },
  { id: 'curaleufu', name: 'Curaleufú', building: 'capilla' },
  { id: 'los-laureles', name: 'Los Laureles', building: 'capilla' },
  { id: 'la-portada', name: 'La Portada', building: 'capilla' },
  { id: 'casa-de-lata', name: 'Casa de Lata', building: 'capilla' },
  { id: 'el-maiten', name: 'El Maitén', building: 'salon' },
  { id: 'los-corrales', name: 'Los Corrales', building: 'capilla' },
  { id: 'chan-chan', name: 'Chan Chan', building: 'capilla' },
  { id: 'ranchillo-adentro', name: 'Ranchillo Adentro', building: 'capilla' },
  { id: 'san-rafael', name: 'San Rafael', building: 'salon' },
  { id: 'la-punta', name: 'La Punta', building: 'capilla' },
  { id: 'el-tartaro', name: 'El Tártaro', building: 'salon' },
  { id: 'maullin', name: 'Maullín', building: 'salon' },
  { id: 'san-lorenzo', name: 'San Lorenzo', building: 'capilla' },
  { id: 'manantiales', name: 'Manantiales', building: 'salon' },
  { id: 'el-yacal', name: 'El Yacal', building: 'salon' },
  { id: 'los-cardones', name: 'Los Cardones', building: 'capilla' },
  {
    id: 'nuestra-senora-de-guadalupe',
    name: 'Nuestra Señora de Guadalupe',
    building: 'capilla',
  },
]

export function findZone(id) {
  return zones.find((z) => z.id === id) || null
}
