import { z } from 'zod'

export const PLATAFORMAS_API = ['instagram', 'facebook'] as const
export type PlataformaApi = (typeof PLATAFORMAS_API)[number]

export interface CuentaConectada {
  accountId: string
  platform: PlataformaApi
  handle: string | null
  clientId: string
}

export interface DatosFrescosDeRed {
  followers: number
  followersDelta: number
  lastPostAt: string | null
  postsThisWeek: number
}

export const datosPostApiSchema = z.object({
  id: z.string(),
  caption: z.string().nullable().optional(),
  media_type: z.string().optional(),
  media_url: z.string().url().optional(),
  timestamp: z.string().optional(),
  insights: z
    .object({
      data: z
        .array(
          z.object({
            name: z.string(),
            values: z.array(z.object({ value: z.number() })),
          }),
        )
        .optional(),
    })
    .optional(),
})

export type DatosPostApi = z.infer<typeof datosPostApiSchema>

export interface MetricaDePostApi {
  pieceId: string | null
  platformPostId: string
  reach: number
  impressions: number
  saves: number
  shares: number
  interactions: number
  measuredAt: string
}

export const datosCampaignApiSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
})

export interface MetricaCampaignApi {
  campaignId: string
  reach: number
  impressions: number
  spend: number
  clicks: number
  /**
   * Estampa ISO de cuándo se midió. Con un solo día no hay tendencia que
   * dibujar; con varios se alimenta la gráfica de costo por resultado.
   */
  measuredAt: string
}
