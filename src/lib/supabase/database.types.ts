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
          asset_status: "pendiente" | "recibido"
          authored_by: Json
          boosted: boolean
          client_id: string
          copy_in: string | null
          copy_out: string | null
          created_at: string
          cta: string | null
          date_locked: boolean
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
          asset_status?: "pendiente" | "recibido"
          authored_by?: Json
          boosted?: boolean
          client_id: string
          copy_in?: string | null
          copy_out?: string | null
          created_at?: string
          cta?: string | null
          date_locked?: boolean
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
          asset_status?: "pendiente" | "recibido"
          authored_by?: Json
          boosted?: boolean
          client_id?: string
          copy_in?: string | null
          copy_out?: string | null
          created_at?: string
          cta?: string | null
          date_locked?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

