export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_audits: {
        Row: {
          client_id: string
          created_at: string
          findings: Json
          id: string
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          score: number
        }
        Insert: {
          client_id: string
          created_at?: string
          findings?: Json
          id?: string
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          score: number
        }
        Update: {
          client_id?: string
          created_at?: string
          findings?: Json
          id?: string
          org_id?: string
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin"
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_audits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_audits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          ad_set_id: string
          client_id: string
          created_at: string
          id: string
          org_id: string
          piece_id: string
          status: "propuesto" | "activo" | "pausado"
          updated_at: string
        }
        Insert: {
          ad_set_id: string
          client_id: string
          created_at?: string
          id?: string
          org_id: string
          piece_id: string
          status?: "propuesto" | "activo" | "pausado"
          updated_at?: string
        }
        Update: {
          ad_set_id?: string
          client_id?: string
          created_at?: string
          id?: string
          org_id?: string
          piece_id?: string
          status?: "propuesto" | "activo" | "pausado"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_ad_set_id_client_id_fkey"
            columns: ["ad_set_id", "client_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_piece_id_client_id_fkey"
            columns: ["piece_id", "client_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      ad_metrics: {
        Row: {
          ad_set_id: string
          clicks: number
          client_id: string
          cost_per_result_cents: number | null
          cpc_cents: number | null
          cpm_cents: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          org_id: string
          reach: number
          results: number
          spend_cents: number
          updated_at: string
        }
        Insert: {
          ad_set_id: string
          clicks?: number
          client_id: string
          cost_per_result_cents?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          org_id: string
          reach?: number
          results?: number
          spend_cents?: number
          updated_at?: string
        }
        Update: {
          ad_set_id?: string
          clicks?: number
          client_id?: string
          cost_per_result_cents?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          org_id?: string
          reach?: number
          results?: number
          spend_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_ad_set_id_client_id_fkey"
            columns: ["ad_set_id", "client_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_proposals: {
        Row: {
          ad_set_id: string | null
          alternative: Json
          applied_at: string | null
          applied_note: string | null
          approved_by: string | null
          campaign_id: string
          client_id: string
          created_at: string
          expected_impact: string | null
          id: string
          instructions: string | null
          kind:
            | "pausar"
            | "reactivar"
            | "mover_presupuesto"
            | "subir_presupuesto"
            | "bajar_presupuesto"
            | "cambiar_creativo"
            | "cambiar_publico"
            | "extender"
            | "cerrar"
          org_id: string
          rationale: string
          risk: string | null
          status:
            | "propuesta"
            | "aprobada"
            | "aprobada_alternativa"
            | "rechazada"
            | "aplicada"
          updated_at: string
        }
        Insert: {
          ad_set_id?: string | null
          alternative?: Json
          applied_at?: string | null
          applied_note?: string | null
          approved_by?: string | null
          campaign_id: string
          client_id: string
          created_at?: string
          expected_impact?: string | null
          id?: string
          instructions?: string | null
          kind:
            | "pausar"
            | "reactivar"
            | "mover_presupuesto"
            | "subir_presupuesto"
            | "bajar_presupuesto"
            | "cambiar_creativo"
            | "cambiar_publico"
            | "extender"
            | "cerrar"
          org_id: string
          rationale: string
          risk?: string | null
          status?:
            | "propuesta"
            | "aprobada"
            | "aprobada_alternativa"
            | "rechazada"
            | "aplicada"
          updated_at?: string
        }
        Update: {
          ad_set_id?: string | null
          alternative?: Json
          applied_at?: string | null
          applied_note?: string | null
          approved_by?: string | null
          campaign_id?: string
          client_id?: string
          created_at?: string
          expected_impact?: string | null
          id?: string
          instructions?: string | null
          kind?:
            | "pausar"
            | "reactivar"
            | "mover_presupuesto"
            | "subir_presupuesto"
            | "bajar_presupuesto"
            | "cambiar_creativo"
            | "cambiar_publico"
            | "extender"
            | "cerrar"
          org_id?: string
          rationale?: string
          risk?: string | null
          status?:
            | "propuesta"
            | "aprobada"
            | "aprobada_alternativa"
            | "rechazada"
            | "aplicada"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_proposals_ad_set_id_client_id_fkey"
            columns: ["ad_set_id", "client_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_proposals_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_proposals_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns_para_cliente"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets: {
        Row: {
          audience_def: Json
          audience_type:
            | "interes"
            | "similares"
            | "retargeting"
            | "amplio"
            | "personalizado"
          budget_cents: number
          campaign_id: string
          client_id: string
          created_at: string
          id: string
          name: string
          org_id: string
          spent_cents: number
          status: "activo" | "pausado" | "cerrado"
          updated_at: string
        }
        Insert: {
          audience_def?: Json
          audience_type:
            | "interes"
            | "similares"
            | "retargeting"
            | "amplio"
            | "personalizado"
          budget_cents?: number
          campaign_id: string
          client_id: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          spent_cents?: number
          status?: "activo" | "pausado" | "cerrado"
          updated_at?: string
        }
        Update: {
          audience_def?: Json
          audience_type?:
            | "interes"
            | "similares"
            | "retargeting"
            | "amplio"
            | "personalizado"
          budget_cents?: number
          campaign_id?: string
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          spent_cents?: number
          status?: "activo" | "pausado" | "cerrado"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_sets_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns_para_cliente"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ad_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_policies: {
        Row: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          created_at: string
          enabled: boolean
          id: string
          model: string | null
          monthly_cap_cents: number
          notes: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          model?: string | null
          monthly_cap_cents?: number
          notes?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          model?: string | null
          monthly_cap_cents?: number
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          context_version: number | null
          cost_cents: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          input_tokens: number | null
          model: string | null
          org_id: string
          output: Json | null
          output_tokens: number | null
          started_at: string
          status: "pendiente" | "corriendo" | "ok" | "error" | "cancelada"
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          context_version?: number | null
          cost_cents?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          input_tokens?: number | null
          model?: string | null
          org_id: string
          output?: Json | null
          output_tokens?: number | null
          started_at?: string
          status?: "pendiente" | "corriendo" | "ok" | "error" | "cancelada"
          trigger?: string
          triggered_by?: string | null
        }
        Update: {
          agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id?: string
          context_version?: number | null
          cost_cents?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          input_tokens?: number | null
          model?: string | null
          org_id?: string
          output?: Json | null
          output_tokens?: number | null
          started_at?: string
          status?: "pendiente" | "corriendo" | "ok" | "error" | "cancelada"
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          client_id: string
          created_at: string
          decided_by: string
          decision: "aprobado" | "cambios"
          id: string
          note: string | null
          org_id: string
          piece_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          decided_by: string
          decision: "aprobado" | "cambios"
          id?: string
          note?: string | null
          org_id: string
          piece_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          decided_by?: string
          decision?: "aprobado" | "cambios"
          id?: string
          note?: string | null
          org_id?: string
          piece_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          client_id: string
          created_at: string
          id: string
          kind: string
          name: string
          notes: string | null
          org_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          kind: string
          name: string
          notes?: string | null
          org_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_notes: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          client_id: string
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_rules: {
        Row: {
          active: boolean
          check_by: "codigo" | "modelo"
          client_id: string
          created_at: string
          id: string
          kind: string
          org_id: string
          params: Json
          rule: string
          severity: "critica" | "alta" | "media" | "baja"
          updated_at: string
        }
        Insert: {
          active?: boolean
          check_by?: "codigo" | "modelo"
          client_id: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
          params?: Json
          rule: string
          severity?: "critica" | "alta" | "media" | "baja"
          updated_at?: string
        }
        Update: {
          active?: boolean
          check_by?: "codigo" | "modelo"
          client_id?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          params?: Json
          rule?: string
          severity?: "critica" | "alta" | "media" | "baja"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget_cents: number
          client_id: string
          created_at: string
          end_date: string
          id: string
          learned: string | null
          learning_goal: string | null
          name: string
          objective: string
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          result_metric: string | null
          spent_cents: number
          start_date: string
          status: "borrador" | "activa" | "pausada" | "cerrada"
          updated_at: string
        }
        Insert: {
          budget_cents?: number
          client_id: string
          created_at?: string
          end_date: string
          id?: string
          learned?: string | null
          learning_goal?: string | null
          name: string
          objective: string
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          result_metric?: string | null
          spent_cents?: number
          start_date: string
          status?: "borrador" | "activa" | "pausada" | "cerrada"
          updated_at?: string
        }
        Update: {
          budget_cents?: number
          client_id?: string
          created_at?: string
          end_date?: string
          id?: string
          learned?: string | null
          learning_goal?: string | null
          name?: string
          objective?: string
          org_id?: string
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin"
          result_metric?: string | null
          spent_cents?: number
          start_date?: string
          status?: "borrador" | "activa" | "pausada" | "cerrada"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          last_seen_at: string | null
          name: string | null
          org_id: string
          revoked_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          last_seen_at?: string | null
          name?: string | null
          org_id: string
          revoked_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          last_seen_at?: string | null
          name?: string | null
          org_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          avatar_url: string | null
          bio: string | null
          brand_color: string | null
          created_at: string
          handle: string | null
          id: string
          name: string
          org_id: string
          slug: string
          tier: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          brand_color?: string | null
          created_at?: string
          handle?: string | null
          id?: string
          name: string
          org_id: string
          slug: string
          tier?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          brand_color?: string | null
          created_at?: string
          handle?: string | null
          id?: string
          name?: string
          org_id?: string
          slug?: string
          tier?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      context_card_versions: {
        Row: {
          approved_examples: string[]
          audience: string | null
          banned_words: string[]
          cadence: string | null
          client_id: string
          created_at: string
          created_by: string | null
          created_by_agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          created_by_run: string | null
          differentiators: string[]
          faqs: Json
          id: string
          learnings: Json
          org_id: string
          positioning: string | null
          tone: string[]
          version: number
          what_it_is: string | null
        }
        Insert: {
          approved_examples?: string[]
          audience?: string | null
          banned_words?: string[]
          cadence?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          created_by_agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          created_by_run?: string | null
          differentiators?: string[]
          faqs?: Json
          id?: string
          learnings?: Json
          org_id: string
          positioning?: string | null
          tone?: string[]
          version: number
          what_it_is?: string | null
        }
        Update: {
          approved_examples?: string[]
          audience?: string | null
          banned_words?: string[]
          cadence?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          created_by_agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          created_by_run?: string | null
          differentiators?: string[]
          faqs?: Json
          id?: string
          learnings?: Json
          org_id?: string
          positioning?: string | null
          tone?: string[]
          version?: number
          what_it_is?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "context_card_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_card_versions_created_by_run_fkey"
            columns: ["created_by_run"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_card_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          created_at: string
          id: string
          options: Json
          org_id: string
          piece_id: string | null
          question: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          severity: "critica" | "alta" | "media" | "baja"
        }
        Insert: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id: string
          created_at?: string
          id?: string
          options?: Json
          org_id: string
          piece_id?: string | null
          question: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: "critica" | "alta" | "media" | "baja"
        }
        Update: {
          agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
          client_id?: string
          created_at?: string
          id?: string
          options?: Json
          org_id?: string
          piece_id?: string | null
          question?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: "critica" | "alta" | "media" | "baja"
        }
        Relationships: [
          {
            foreignKeyName: "escalations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          org_id: string
          place: string | null
          scheduled_on: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          place?: string | null
          scheduled_on: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          place?: string | null
          scheduled_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      human_edits: {
        Row: {
          agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          client_id: string
          created_at: string
          edited_by: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          org_id: string
          piece_id: string | null
          run_id: string | null
        }
        Insert: {
          agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          client_id: string
          created_at?: string
          edited_by: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id: string
          piece_id?: string | null
          run_id?: string | null
        }
        Update: {
          agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          client_id?: string
          created_at?: string
          edited_by?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
          piece_id?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "human_edits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_edits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_edits_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_edits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      key_dates: {
        Row: {
          campaign_idea: string | null
          client_id: string
          created_at: string
          date: string
          has_budget: boolean
          id: string
          kind:
            | "festividad"
            | "aniversario"
            | "evento"
            | "promocion"
            | "temporada"
          notes: string | null
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          campaign_idea?: string | null
          client_id: string
          created_at?: string
          date: string
          has_budget?: boolean
          id?: string
          kind:
            | "festividad"
            | "aniversario"
            | "evento"
            | "promocion"
            | "temporada"
          notes?: string | null
          org_id: string
          title: string
          updated_at?: string
        }
        Update: {
          campaign_idea?: string | null
          client_id?: string
          created_at?: string
          date?: string
          has_budget?: boolean
          id?: string
          kind?:
            | "festividad"
            | "aniversario"
            | "evento"
            | "promocion"
            | "temporada"
          notes?: string | null
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_dates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_dates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: "owner" | "staff"
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: "owner" | "staff"
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: "owner" | "staff"
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: "owner" | "staff"
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: "owner" | "staff"
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: "owner" | "staff"
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      piece_comments: {
        Row: {
          author_id: string
          body: string
          client_id: string
          created_at: string
          from_client: boolean
          id: string
          org_id: string
          piece_id: string
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          created_at?: string
          from_client: boolean
          id?: string
          org_id: string
          piece_id: string
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          from_client?: boolean
          id?: string
          org_id?: string
          piece_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_comments_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces: {
        Row: {
          asset_source: string | null
          asset_status: "pendiente" | "recibido"
          asset_url: string | null
          assignee_id: string | null
          authored_by: Json
          boosted: boolean
          client_id: string
          copy_in: string | null
          copy_out: string | null
          created_at: string
          cta: string | null
          date_locked: boolean
          due_date: string | null
          format: "post" | "carrusel" | "reel"
          hashtags: string[]
          hook: string | null
          id: string
          idea: string | null
          month: string
          org_id: string
          pillar_id: string | null
          platforms: ("instagram" | "facebook" | "tiktok" | "linkedin")[]
          publish_at: string | null
          script: string | null
          slot_index: number
          sprint_id: string | null
          status:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at: string
        }
        Insert: {
          asset_source?: string | null
          asset_status?: "pendiente" | "recibido"
          asset_url?: string | null
          assignee_id?: string | null
          authored_by?: Json
          boosted?: boolean
          client_id: string
          copy_in?: string | null
          copy_out?: string | null
          created_at?: string
          cta?: string | null
          date_locked?: boolean
          due_date?: string | null
          format: "post" | "carrusel" | "reel"
          hashtags?: string[]
          hook?: string | null
          id?: string
          idea?: string | null
          month: string
          org_id: string
          pillar_id?: string | null
          platforms?: ("instagram" | "facebook" | "tiktok" | "linkedin")[]
          publish_at?: string | null
          script?: string | null
          slot_index?: number
          sprint_id?: string | null
          status?:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at?: string
        }
        Update: {
          asset_source?: string | null
          asset_status?: "pendiente" | "recibido"
          asset_url?: string | null
          assignee_id?: string | null
          authored_by?: Json
          boosted?: boolean
          client_id?: string
          copy_in?: string | null
          copy_out?: string | null
          created_at?: string
          cta?: string | null
          date_locked?: boolean
          due_date?: string | null
          format?: "post" | "carrusel" | "reel"
          hashtags?: string[]
          hook?: string | null
          id?: string
          idea?: string | null
          month?: string
          org_id?: string
          pillar_id?: string | null
          platforms?: ("instagram" | "facebook" | "tiktok" | "linkedin")[]
          publish_at?: string | null
          script?: string | null
          slot_index?: number
          sprint_id?: string | null
          status?:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      pillars: {
        Row: {
          client_id: string
          color: string
          created_at: string
          id: string
          name: string
          org_id: string
          position: number
          target_pct: number
          updated_at: string
        }
        Insert: {
          client_id: string
          color: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          position?: number
          target_pct?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          position?: number
          target_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pillars_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pillars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      private_notes: {
        Row: {
          author_id: string
          body: string
          client_id: string
          created_at: string
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      results_monthly: {
        Row: {
          client_id: string
          created_at: string
          id: string
          impressions: number
          interactions: number
          link_clicks: number
          month: string
          new_followers: number
          org_id: string
          profile_visits: number
          reach: number
          saves: number
          shares: number
          source: "manual" | "csv" | "api"
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          impressions?: number
          interactions?: number
          link_clicks?: number
          month: string
          new_followers?: number
          org_id: string
          profile_visits?: number
          reach?: number
          saves?: number
          shares?: number
          source?: "manual" | "csv" | "api"
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          impressions?: number
          interactions?: number
          link_clicks?: number
          month?: string
          new_followers?: number
          org_id?: string
          profile_visits?: number
          reach?: number
          saves?: number
          shares?: number
          source?: "manual" | "csv" | "api"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_monthly_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      results_piece: {
        Row: {
          client_id: string
          created_at: string
          id: string
          impressions: number
          interactions: number
          measured_at: string
          org_id: string
          piece_id: string
          reach: number
          saves: number
          shares: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          impressions?: number
          interactions?: number
          measured_at?: string
          org_id: string
          piece_id: string
          reach?: number
          saves?: number
          shares?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          impressions?: number
          interactions?: number
          measured_at?: string
          org_id?: string
          piece_id?: string
          reach?: number
          saves?: number
          shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "results_piece_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_piece_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_piece_piece_id_client_id_fkey"
            columns: ["piece_id", "client_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      scripts: {
        Row: {
          alternative: string | null
          client_id: string
          created_at: string
          duration_s: number | null
          fit_reason: string | null
          fit_score: number | null
          id: string
          org_id: string
          piece_id: string | null
          requirements: string | null
          scenes: Json
          status: "propuesto" | "aceptado" | "editado" | "descartado"
          trend_id: string | null
          updated_at: string
        }
        Insert: {
          alternative?: string | null
          client_id: string
          created_at?: string
          duration_s?: number | null
          fit_reason?: string | null
          fit_score?: number | null
          id?: string
          org_id: string
          piece_id?: string | null
          requirements?: string | null
          scenes?: Json
          status?: "propuesto" | "aceptado" | "editado" | "descartado"
          trend_id?: string | null
          updated_at?: string
        }
        Update: {
          alternative?: string | null
          client_id?: string
          created_at?: string
          duration_s?: number | null
          fit_reason?: string | null
          fit_score?: number | null
          id?: string
          org_id?: string
          piece_id?: string | null
          requirements?: string | null
          scenes?: Json
          status?: "propuesto" | "aceptado" | "editado" | "descartado"
          trend_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_piece_id_client_id_fkey"
            columns: ["piece_id", "client_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "scripts_trend_id_org_id_fkey"
            columns: ["trend_id", "org_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          checked_at: string | null
          client_id: string
          created_at: string
          followers: number
          followers_delta: number
          handle: string | null
          id: string
          last_post_at: string | null
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          posts_per_week: number
          profile_checklist: Json
          target_per_week: number
          unanswered_comments: number
          unanswered_dms: number
          updated_at: string
          url: string | null
        }
        Insert: {
          checked_at?: string | null
          client_id: string
          created_at?: string
          followers?: number
          followers_delta?: number
          handle?: string | null
          id?: string
          last_post_at?: string | null
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          posts_per_week?: number
          profile_checklist?: Json
          target_per_week?: number
          unanswered_comments?: number
          unanswered_dms?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          checked_at?: string | null
          client_id?: string
          created_at?: string
          followers?: number
          followers_delta?: number
          handle?: string | null
          id?: string
          last_post_at?: string | null
          org_id?: string
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin"
          posts_per_week?: number
          profile_checklist?: Json
          target_per_week?: number
          unanswered_comments?: number
          unanswered_dms?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          name: string
          org_id: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          name: string
          org_id: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          org_id?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          client_id: string
          created_at: string
          id: string
          kind: "diaria" | "campana" | "interactiva"
          month: string
          org_id: string
          scheduled_on: string
          slides: Json
          status:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          kind?: "diaria" | "campana" | "interactiva"
          month: string
          org_id: string
          scheduled_on: string
          slides?: Json
          status?:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          kind?: "diaria" | "campana" | "interactiva"
          month?: string
          org_id?: string
          scheduled_on?: string
          slides?: Json
          status?:
            | "idea"
            | "escrito"
            | "revisado"
            | "con_cliente"
            | "aprobado"
            | "publicado"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string
          created_at: string
          depends_on: "yo" | "cliente" | "agente"
          due_date: string | null
          id: string
          org_id: string
          status: "pendiente" | "en_curso" | "bloqueada" | "hecha"
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          depends_on?: "yo" | "cliente" | "agente"
          due_date?: string | null
          id?: string
          org_id: string
          status?: "pendiente" | "en_curso" | "bloqueada" | "hecha"
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          depends_on?: "yo" | "cliente" | "agente"
          due_date?: string | null
          id?: string
          org_id?: string
          status?: "pendiente" | "en_curso" | "bloqueada" | "hecha"
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          kind: "audio" | "formato" | "reto" | "tema"
          momentum: "subiendo" | "pico" | "bajando"
          notes: string | null
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          reference_url: string | null
          spotted_at: string
          spotted_by: string | null
          title: string
          updated_at: string
          verticals: string[]
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          kind: "audio" | "formato" | "reto" | "tema"
          momentum?: "subiendo" | "pico" | "bajando"
          notes?: string | null
          org_id: string
          platform: "instagram" | "facebook" | "tiktok" | "linkedin"
          reference_url?: string | null
          spotted_at?: string
          spotted_by?: string | null
          title: string
          updated_at?: string
          verticals?: string[]
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          kind?: "audio" | "formato" | "reto" | "tema"
          momentum?: "subiendo" | "pico" | "bajando"
          notes?: string | null
          org_id?: string
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin"
          reference_url?: string | null
          spotted_at?: string
          spotted_by?: string | null
          title?: string
          updated_at?: string
          verticals?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trends_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          capacity_declared: number | null
          client_id: string
          created_at: string
          feed_counts: Json
          id: string
          month: string
          org_id: string
          pillar_mix: Json
          rationale: Json
          story_counts: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          capacity_declared?: number | null
          client_id: string
          created_at?: string
          feed_counts?: Json
          id?: string
          month: string
          org_id: string
          pillar_mix?: Json
          rationale?: Json
          story_counts?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          capacity_declared?: number | null
          client_id?: string
          created_at?: string
          feed_counts?: Json
          id?: string
          month?: string
          org_id?: string
          pillar_mix?: Json
          rationale?: Json
          story_counts?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          client_id: string
          created_at: string
          display_name: string | null
          id: string
          last_message_at: string | null
          org_id: string
          updated_at: string
          wa_phone: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_message_at?: string | null
          org_id: string
          updated_at?: string
          wa_phone: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_message_at?: string | null
          org_id?: string
          updated_at?: string
          wa_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_feedback: {
        Row: {
          body: string
          client_id: string
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          message_id: string | null
          month: string | null
          org_id: string
          piece_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          body: string
          client_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message_id?: string | null
          month?: string | null
          org_id: string
          piece_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          body?: string
          client_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message_id?: string | null
          month?: string | null
          org_id?: string
          piece_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "wa_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_feedback_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          authored_by_agent:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          body: string | null
          client_id: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media: Json
          org_id: string
          piece_ids: string[]
          sent_at: string | null
          status: string
          wa_message_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          authored_by_agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          body?: string | null
          client_id: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media?: Json
          org_id: string
          piece_ids?: string[]
          sent_at?: string | null
          status: string
          wa_message_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          authored_by_agent?:
            | "estratega"
            | "analista"
            | "guionista"
            | "redactor"
            | "editor_marca"
            | "pautero"
            | "auditor"
            | "cuenta"
            | null
          body?: string | null
          client_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media?: Json
          org_id?: string
          piece_ids?: string[]
          sent_at?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      campaigns_para_cliente: {
        Row: {
          client_id: string | null
          end_date: string | null
          id: string | null
          name: string | null
          objective: string | null
          platform: "instagram" | "facebook" | "tiktok" | "linkedin" | null
          result_metric: string | null
          start_date: string | null
          status: "borrador" | "activa" | "pausada" | "cerrada" | null
        }
        Insert: {
          client_id?: string | null
          end_date?: string | null
          id?: string | null
          name?: string | null
          objective?: string | null
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin" | null
          result_metric?: string | null
          start_date?: string | null
          status?: "borrador" | "activa" | "pausada" | "cerrada" | null
        }
        Update: {
          client_id?: string | null
          end_date?: string | null
          id?: string | null
          name?: string | null
          objective?: string | null
          platform?: "instagram" | "facebook" | "tiktok" | "linkedin" | null
          result_metric?: string | null
          start_date?: string | null
          status?: "borrador" | "activa" | "pausada" | "cerrada" | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_pending_invites: { Args: never; Returns: undefined }
      edit_piece_field: {
        Args: {
          p_field: string
          p_piece: string
          p_tags: string[]
          p_value: string
        }
        Returns: undefined
      }
      shift_piece_slots: {
        Args: { moves: Json; target_client: string }
        Returns: number
      }
      swap_piece_slots: { Args: { a: string; b: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

