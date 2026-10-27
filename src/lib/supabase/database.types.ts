export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          current: boolean
          id: string
          ord: number
        }
        Insert: {
          current: boolean
          id: string
          ord: number
        }
        Update: {
          current?: boolean
          id?: string
          ord?: number
        }
        Relationships: []
      }
      access_review_items: {
        Row: {
          account_id: string
          decision: string | null
          ord: number
          review_id: string
        }
        Insert: {
          account_id: string
          decision?: string | null
          ord: number
          review_id: string
        }
        Update: {
          account_id?: string
          decision?: string | null
          ord?: number
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "access_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      access_reviews: {
        Row: {
          due: string
          id: string
          name: string
          ord: number
          reviewer_id: string
          scope: string
          status: string
        }
        Insert: {
          due: string
          id: string
          name: string
          ord: number
          reviewer_id: string
          scope: string
          status: string
        }
        Update: {
          due?: string
          id?: string
          name?: string
          ord?: number
          reviewer_id?: string
          scope?: string
          status?: string
        }
        Relationships: []
      }
      account_assignments: {
        Row: {
          account_id: string
          expires: string | null
          granted_at: string
          granted_by: string
          id: string
          note: string | null
          ord: number
          role_id: string
          scope_bodies: string[] | null
          scope_datasets: string[] | null
          scope_units: string[] | null
          scope_years: string[] | null
        }
        Insert: {
          account_id: string
          expires?: string | null
          granted_at: string
          granted_by: string
          id: string
          note?: string | null
          ord: number
          role_id: string
          scope_bodies?: string[] | null
          scope_datasets?: string[] | null
          scope_units?: string[] | null
          scope_years?: string[] | null
        }
        Update: {
          account_id?: string
          expires?: string | null
          granted_at?: string
          granted_by?: string
          id?: string
          note?: string | null
          ord?: number
          role_id?: string
          scope_bodies?: string[] | null
          scope_datasets?: string[] | null
          scope_units?: string[] | null
          scope_years?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "account_assignments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_data_grants: {
        Row: {
          access: string
          account_id: string
          dataset_id: string
          ord: number
          request_id: string
          until: string
        }
        Insert: {
          access: string
          account_id: string
          dataset_id: string
          ord: number
          request_id: string
          until: string
        }
        Update: {
          access?: string
          account_id?: string
          dataset_id?: string
          ord?: number
          request_id?: string
          until?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_data_grants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_transfers: {
        Row: {
          account_id: string
          at: string
          by: string
          from_unit: string
          ord: number
          to_unit: string
        }
        Insert: {
          account_id: string
          at: string
          by: string
          from_unit: string
          ord: number
          to_unit: string
        }
        Update: {
          account_id?: string
          at?: string
          by?: string
          from_unit?: string
          ord?: number
          to_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_transfers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          external: boolean | null
          first_login: string | null
          id: string
          identity: string
          invited_at: string | null
          kept_active_at: string | null
          kept_active_by: string | null
          last_login: string | null
          mfa_enrolled: boolean
          mfa_method: string | null
          name: string
          ord: number
          reauth_after: string | null
          status: string
          status_changed_at: string | null
          status_reason: string | null
          title: string
          unit_id: string
        }
        Insert: {
          avatar?: string | null
          created_at: string
          email: string
          external?: boolean | null
          first_login?: string | null
          id: string
          identity: string
          invited_at?: string | null
          kept_active_at?: string | null
          kept_active_by?: string | null
          last_login?: string | null
          mfa_enrolled?: boolean
          mfa_method?: string | null
          name: string
          ord: number
          reauth_after?: string | null
          status: string
          status_changed_at?: string | null
          status_reason?: string | null
          title?: string
          unit_id: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          external?: boolean | null
          first_login?: string | null
          id?: string
          identity?: string
          invited_at?: string | null
          kept_active_at?: string | null
          kept_active_by?: string | null
          last_login?: string | null
          mfa_enrolled?: boolean
          mfa_method?: string | null
          name?: string
          ord?: number
          reauth_after?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          title?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          at: string
          by: string
          decision: string
          note: string | null
          ord: number
          request_id: string
          step: number
        }
        Insert: {
          at: string
          by: string
          decision: string
          note?: string | null
          ord: number
          request_id: string
          step: number
        }
        Update: {
          at?: string
          by?: string
          decision?: string
          note?: string | null
          ord?: number
          request_id?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          completed_at: string | null
          due: string
          id: string
          justification: string
          kind: string
          ord: number
          payload: Json
          requested_at: string
          requester_id: string
          reviewing_at: string | null
          reviewing_by: string | null
          status: string
          step: number
          title: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          due: string
          id: string
          justification?: string
          kind: string
          ord: number
          payload: Json
          requested_at: string
          requester_id: string
          reviewing_at?: string | null
          reviewing_by?: string | null
          status: string
          step?: number
          title: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          due?: string
          id?: string
          justification?: string
          kind?: string
          ord?: number
          payload?: Json
          requested_at?: string
          requester_id?: string
          reviewing_at?: string | null
          reviewing_by?: string | null
          status?: string
          step?: number
          title?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      assistance_requests: {
        Row: {
          at: string
          by: string
          id: string
          ord: number
          topic: string
          unit_id: string
          urgent: boolean
        }
        Insert: {
          at: string
          by: string
          id: string
          ord: number
          topic: string
          unit_id: string
          urgent?: boolean
        }
        Update: {
          at?: string
          by?: string
          id?: string
          ord?: number
          topic?: string
          unit_id?: string
          urgent?: boolean
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: string
          at: string
          category: string
          detail: string | null
          hash: string
          outcome: string
          prev: string
          resource_id: string
          resource_label: string
          resource_type: string
          seq: number
        }
        Insert: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: string
          at: string
          category: string
          detail?: string | null
          hash: string
          outcome: string
          prev: string
          resource_id: string
          resource_label: string
          resource_type: string
          seq: number
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string
          actor_role?: string
          at?: string
          category?: string
          detail?: string | null
          hash?: string
          outcome?: string
          prev?: string
          resource_id?: string
          resource_label?: string
          resource_type?: string
          seq?: number
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          encrypted: boolean
          id: number
          monthly_months: number
          offsite: boolean
          retention_days: number
          rpo_minutes: number
          rto_minutes: number
          schedule_full: string
          schedule_incremental: string
        }
        Insert: {
          encrypted: boolean
          id?: number
          monthly_months: number
          offsite: boolean
          retention_days: number
          rpo_minutes: number
          rto_minutes: number
          schedule_full: string
          schedule_incremental: string
        }
        Update: {
          encrypted?: boolean
          id?: number
          monthly_months?: number
          offsite?: boolean
          retention_days?: number
          rpo_minutes?: number
          rto_minutes?: number
          schedule_full?: string
          schedule_incremental?: string
        }
        Relationships: []
      }
      calendar_entries: {
        Row: {
          due: string
          id: string
          label: string
          ord: number
          set_at: string
          set_by: string
          slug: string
          source: string
          url: string | null
        }
        Insert: {
          due: string
          id: string
          label: string
          ord: number
          set_at: string
          set_by: string
          slug: string
          source: string
          url?: string | null
        }
        Update: {
          due?: string
          id?: string
          label?: string
          ord?: number
          set_at?: string
          set_by?: string
          slug?: string
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_entries_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "ranking_frameworks"
            referencedColumns: ["slug"]
          },
        ]
      }
      calendar_items: {
        Row: {
          item: string
          month: string
          position: number
        }
        Insert: {
          item: string
          month: string
          position: number
        }
        Update: {
          item?: string
          month?: string
          position?: number
        }
        Relationships: []
      }
      dataset_versions: {
        Row: {
          at: string
          by: string
          dataset_id: string
          note: string
          ord: number
          v: number
        }
        Insert: {
          at: string
          by: string
          dataset_id: string
          note?: string
          ord: number
          v: number
        }
        Update: {
          at?: string
          by?: string
          dataset_id?: string
          note?: string
          ord?: number
          v?: number
        }
        Relationships: [
          {
            foreignKeyName: "dataset_versions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          bodies: string[]
          classification: string
          description: string
          export_policy: string
          id: string
          locked: string | null
          name: string
          ord: number
          owner_unit_id: string
          personal: boolean
          public_surface: string | null
          records: number
          retention_then: string
          retention_years: number
          steward_id: string
          updated_at: string
          version: number
        }
        Insert: {
          bodies?: string[]
          classification: string
          description?: string
          export_policy: string
          id: string
          locked?: string | null
          name: string
          ord: number
          owner_unit_id: string
          personal?: boolean
          public_surface?: string | null
          records?: number
          retention_then: string
          retention_years: number
          steward_id?: string
          updated_at: string
          version?: number
        }
        Update: {
          bodies?: string[]
          classification?: string
          description?: string
          export_policy?: string
          id?: string
          locked?: string | null
          name?: string
          ord?: number
          owner_unit_id?: string
          personal?: boolean
          public_surface?: string | null
          records?: number
          retention_then?: string
          retention_years?: number
          steward_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "datasets_owner_unit_id_fkey"
            columns: ["owner_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_findings: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          due: string
          found_at: string
          id: string
          label: string
          ord: number
          quote: string
          slug: string
          source_id: string
          state: string
          target: string
          url: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          due: string
          found_at: string
          id: string
          label: string
          ord: number
          quote?: string
          slug: string
          source_id: string
          state: string
          target: string
          url: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          due?: string
          found_at?: string
          id?: string
          label?: string
          ord?: number
          quote?: string
          slug?: string
          source_id?: string
          state?: string
          target?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_findings_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "ranking_frameworks"
            referencedColumns: ["slug"]
          },
        ]
      }
      deadline_sources: {
        Row: {
          body: string
          fetch_url: string | null
          id: string
          kind: string
          name: string
          note: string
          page: string
          pattern: string | null
          position: number
          rules: Json
        }
        Insert: {
          body: string
          fetch_url?: string | null
          id: string
          kind: string
          name: string
          note?: string
          page: string
          pattern?: string | null
          position: number
          rules?: Json
        }
        Update: {
          body?: string
          fetch_url?: string | null
          id?: string
          kind?: string
          name?: string
          note?: string
          page?: string
          pattern?: string | null
          position?: number
          rules?: Json
        }
        Relationships: []
      }
      deadline_watch: {
        Row: {
          changed_at: string | null
          checked_at: string
          hash: string | null
          id: string
          note: string
          ord: number
          status: string
        }
        Insert: {
          changed_at?: string | null
          checked_at: string
          hash?: string | null
          id: string
          note?: string
          ord: number
          status: string
        }
        Update: {
          changed_at?: string | null
          checked_at?: string
          hash?: string | null
          id?: string
          note?: string
          ord?: number
          status?: string
        }
        Relationships: []
      }
      dictionary_links: {
        Row: {
          indicator: string
          position: number
          ranking: string
          term: string
        }
        Insert: {
          indicator: string
          position: number
          ranking: string
          term: string
        }
        Update: {
          indicator?: string
          position?: number
          ranking?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "dictionary_links_term_fkey"
            columns: ["term"]
            isOneToOne: false
            referencedRelation: "dictionary_terms"
            referencedColumns: ["term"]
          },
        ]
      }
      dictionary_terms: {
        Row: {
          definition: string
          position: number
          term: string
        }
        Insert: {
          definition: string
          position: number
          term: string
        }
        Update: {
          definition?: string
          position?: number
          term?: string
        }
        Relationships: []
      }
      duplicate_decisions: {
        Row: {
          at: string
          by: string
          decision: string
          keep: string | null
          key: string
          ord: number
        }
        Insert: {
          at: string
          by: string
          decision: string
          keep?: string | null
          key: string
          ord: number
        }
        Update: {
          at?: string
          by?: string
          decision?: string
          keep?: string | null
          key?: string
          ord?: number
        }
        Relationships: []
      }
      evidence: {
        Row: {
          attachments: Json
          background: string
          beneficiaries: string
          citations: Json
          files: string[]
          id: string
          level: number
          links: Json
          mapped_to: string[]
          ord: number
          period: string
          program_id: string | null
          result: string
          sdgs: number[]
          stage: number
          status: string
          submitted: string
          submitted_by: string
          submitted_by_id: string | null
          summary: string
          title: string
          type: string
          unit_id: string
          verified_by: string
        }
        Insert: {
          attachments?: Json
          background?: string
          beneficiaries?: string
          citations?: Json
          files?: string[]
          id: string
          level: number
          links?: Json
          mapped_to?: string[]
          ord: number
          period: string
          program_id?: string | null
          result?: string
          sdgs?: number[]
          stage: number
          status: string
          submitted: string
          submitted_by: string
          submitted_by_id?: string | null
          summary?: string
          title: string
          type: string
          unit_id: string
          verified_by?: string
        }
        Update: {
          attachments?: Json
          background?: string
          beneficiaries?: string
          citations?: Json
          files?: string[]
          id?: string
          level?: number
          links?: Json
          mapped_to?: string[]
          ord?: number
          period?: string
          program_id?: string | null
          result?: string
          sdgs?: number[]
          stage?: number
          status?: string
          submitted?: string
          submitted_by?: string
          submitted_by_id?: string | null
          summary?: string
          title?: string
          type?: string
          unit_id?: string
          verified_by?: string
        }
        Relationships: []
      }
      evidence_comments: {
        Row: {
          by: string
          date: string
          evidence_id: string
          ord: number
          role: string
          text: string
        }
        Insert: {
          by: string
          date: string
          evidence_id: string
          ord: number
          role: string
          text: string
        }
        Update: {
          by?: string
          date?: string
          evidence_id?: string
          ord?: number
          role?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_comments_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          accounts: string[]
          description: string
          id: string
          mode: string
          name: string
          ord: number
          units: string[]
          updated_at: string
        }
        Insert: {
          accounts?: string[]
          description?: string
          id: string
          mode: string
          name: string
          ord: number
          units?: string[]
          updated_at: string
        }
        Update: {
          accounts?: string[]
          description?: string
          id?: string
          mode?: string
          name?: string
          ord?: number
          units?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      features: {
        Row: {
          area: string
          description: string
          enabled: boolean
          id: string
          name: string
          ord: number
        }
        Insert: {
          area: string
          description?: string
          enabled: boolean
          id: string
          name: string
          ord: number
        }
        Update: {
          area?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          ord?: number
        }
        Relationships: []
      }
      hub_auth_allow: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      hub_meta: {
        Row: {
          id: number
          schema: number
          seeded_at: string
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          schema: number
          seeded_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          schema?: number
          seeded_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      hub_post_views: {
        Row: {
          day: string
          last_viewed_at: string
          slug: string
          views: number
        }
        Insert: {
          day: string
          last_viewed_at?: string
          slug: string
          views?: number
        }
        Update: {
          day?: string
          last_viewed_at?: string
          slug?: string
          views?: number
        }
        Relationships: []
      }
      hub_rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      hub_recovery_points: {
        Row: {
          body: string
          checksum: string
          created_at: string
          id: string
        }
        Insert: {
          body: string
          checksum: string
          created_at?: string
          id: string
        }
        Update: {
          body?: string
          checksum?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      hub_state: {
        Row: {
          id: number
          schema: number
          state: Json
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          schema: number
          state: Json
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          schema?: number
          state?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      hub_tables: {
        Row: {
          name: string
          position: number
        }
        Insert: {
          name: string
          position: number
        }
        Update: {
          name?: string
          position?: number
        }
        Relationships: []
      }
      id_counters: {
        Row: {
          name: string
          value: number
        }
        Insert: {
          name: string
          value: number
        }
        Update: {
          name?: string
          value?: number
        }
        Relationships: []
      }
      incident_timeline: {
        Row: {
          at: string
          by: string
          incident_id: string
          note: string
          ord: number
        }
        Insert: {
          at: string
          by: string
          incident_id: string
          note: string
          ord: number
        }
        Update: {
          at?: string
          by?: string
          incident_id?: string
          note?: string
          ord?: number
        }
        Relationships: [
          {
            foreignKeyName: "incident_timeline_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          escalated_to: string | null
          id: string
          ord: number
          personal_data: boolean
          reported: string
          reporter_id: string
          severity: string
          status: string
          title: string
        }
        Insert: {
          escalated_to?: string | null
          id: string
          ord: number
          personal_data: boolean
          reported: string
          reporter_id: string
          severity: string
          status: string
          title: string
        }
        Update: {
          escalated_to?: string | null
          id?: string
          ord?: number
          personal_data?: boolean
          reported?: string
          reporter_id?: string
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      innovations: {
        Row: {
          at: string
          by: string
          category: string
          id: string
          name: string
          ord: number
          unit_id: string
        }
        Insert: {
          at: string
          by: string
          category: string
          id: string
          name: string
          ord: number
          unit_id: string
        }
        Update: {
          at?: string
          by?: string
          category?: string
          id?: string
          name?: string
          ord?: number
          unit_id?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt: string
          bytes: number | null
          created_on: string | null
          creator: string | null
          creator_url: string | null
          credit: string | null
          credit_required: boolean
          focus: string | null
          height: number | null
          key: string
          kind: string
          license: string | null
          license_code: string | null
          license_url: string | null
          notes: string | null
          path: string
          position: number
          source_page: string | null
          source_url: string | null
          title: string | null
          via: string | null
          width: number | null
        }
        Insert: {
          alt?: string
          bytes?: number | null
          created_on?: string | null
          creator?: string | null
          creator_url?: string | null
          credit?: string | null
          credit_required?: boolean
          focus?: string | null
          height?: number | null
          key: string
          kind: string
          license?: string | null
          license_code?: string | null
          license_url?: string | null
          notes?: string | null
          path: string
          position: number
          source_page?: string | null
          source_url?: string | null
          title?: string | null
          via?: string | null
          width?: number | null
        }
        Update: {
          alt?: string
          bytes?: number | null
          created_on?: string | null
          creator?: string | null
          creator_url?: string | null
          credit?: string | null
          credit_required?: boolean
          focus?: string | null
          height?: number | null
          key?: string
          kind?: string
          license?: string | null
          license_code?: string | null
          license_url?: string | null
          notes?: string | null
          path?: string
          position?: number
          source_page?: string | null
          source_url?: string | null
          title?: string | null
          via?: string | null
          width?: number | null
        }
        Relationships: []
      }
      media_uploads: {
        Row: {
          created_at: string
          key: string
          released_at: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          key: string
          released_at?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          key?: string
          released_at?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      notice_reads: {
        Row: {
          account_id: string
          notice_id: string
          ord: number
        }
        Insert: {
          account_id: string
          notice_id: string
          ord: number
        }
        Update: {
          account_id?: string
          notice_id?: string
          ord?: number
        }
        Relationships: [
          {
            foreignKeyName: "notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "notices"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          at: string
          href: string
          id: string
          ord: number
          recipient: string
          template_id: string | null
          text: string
        }
        Insert: {
          at: string
          href: string
          id: string
          ord: number
          recipient: string
          template_id?: string | null
          text: string
        }
        Update: {
          at?: string
          href?: string
          id?: string
          ord?: number
          recipient?: string
          template_id?: string | null
          text?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          channel: string
          enabled: boolean
          event: string
          id: string
          name: string
          ord: number
          subject: string
        }
        Insert: {
          body: string
          channel: string
          enabled: boolean
          event: string
          id: string
          name: string
          ord: number
          subject: string
        }
        Update: {
          body?: string
          channel?: string
          enabled?: boolean
          event?: string
          id?: string
          name?: string
          ord?: number
          subject?: string
        }
        Relationships: []
      }
      office_entries: {
        Row: {
          body: string
          href: string | null
          owners: string | null
          person: string | null
          position: number
          section: string
          timing: string | null
          title: string
        }
        Insert: {
          body?: string
          href?: string | null
          owners?: string | null
          person?: string | null
          position: number
          section: string
          timing?: string | null
          title: string
        }
        Update: {
          body?: string
          href?: string | null
          owners?: string | null
          person?: string | null
          position?: number
          section?: string
          timing?: string | null
          title?: string
        }
        Relationships: []
      }
      office_profile: {
        Row: {
          city: string
          email: string
          id: number
          landmark: string
          location: string
          mission: string
          name: string
          phone: string
          profile_date: string
          reports_to: string
          street: string
          summary: string
          vision: string
        }
        Insert: {
          city: string
          email: string
          id?: number
          landmark: string
          location: string
          mission: string
          name: string
          phone: string
          profile_date: string
          reports_to: string
          street: string
          summary: string
          vision: string
        }
        Update: {
          city?: string
          email?: string
          id?: number
          landmark?: string
          location?: string
          mission?: string
          name?: string
          phone?: string
          profile_date?: string
          reports_to?: string
          street?: string
          summary?: string
          vision?: string
        }
        Relationships: []
      }
      org_unit_admins: {
        Row: {
          account_id: string
          ord: number
          unit_id: string
        }
        Insert: {
          account_id: string
          ord: number
          unit_id: string
        }
        Update: {
          account_id?: string
          ord?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_unit_admins_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_unit_admins_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_unit_history: {
        Row: {
          at: string
          by: string
          change: string
          ord: number
          unit_id: string
        }
        Insert: {
          at: string
          by: string
          change: string
          ord: number
          unit_id: string
        }
        Update: {
          at?: string
          by?: string
          change?: string
          ord?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_unit_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_units: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          code: string
          directory_key: string | null
          emails: string[] | null
          emblem_height: number | null
          emblem_src: string | null
          emblem_width: number | null
          established: string | null
          id: string
          kind: string
          merged_into: string | null
          name: string
          ord: number
          parent_id: string | null
          status: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          code: string
          directory_key?: string | null
          emails?: string[] | null
          emblem_height?: number | null
          emblem_src?: string | null
          emblem_width?: number | null
          established?: string | null
          id: string
          kind: string
          merged_into?: string | null
          name: string
          ord: number
          parent_id?: string | null
          status: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          code?: string
          directory_key?: string | null
          emails?: string[] | null
          emblem_height?: number | null
          emblem_src?: string | null
          emblem_width?: number | null
          established?: string | null
          id?: string
          kind?: string
          merged_into?: string | null
          name?: string
          ord?: number
          parent_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_units_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          alt: string
          height: number
          ord: number
          post_id: string
          role: string
          src: string
          width: number
        }
        Insert: {
          alt?: string
          height?: number
          ord: number
          post_id: string
          role: string
          src: string
          width?: number
        }
        Update: {
          alt?: string
          height?: number
          ord?: number
          post_id?: string
          role?: string
          src?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          hashtags: string[] | null
          id: string
          layout: string | null
          ord: number
          published_at: string | null
          sdgs: number[]
          slug: string
          status: string
          subtitle: string
          themes: string[]
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at: string
          hashtags?: string[] | null
          id: string
          layout?: string | null
          ord: number
          published_at?: string | null
          sdgs?: number[]
          slug: string
          status: string
          subtitle?: string
          themes?: string[]
          title: string
          unit_id?: string | null
          updated_at: string
          updated_by: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          hashtags?: string[] | null
          id?: string
          layout?: string | null
          ord?: number
          published_at?: string | null
          sdgs?: number[]
          slug?: string
          status?: string
          subtitle?: string
          themes?: string[]
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      privacy_assessments: {
        Row: {
          dataset_id: string
          id: string
          measures: string
          name: string
          ord: number
          owner: string
          risk: string
          status: string
          updated: string
        }
        Insert: {
          dataset_id: string
          id: string
          measures?: string
          name: string
          ord: number
          owner: string
          risk: string
          status: string
          updated: string
        }
        Update: {
          dataset_id?: string
          id?: string
          measures?: string
          name?: string
          ord?: number
          owner?: string
          risk?: string
          status?: string
          updated?: string
        }
        Relationships: []
      }
      published_reports: {
        Row: {
          at: string
          by: string
          id: string
          ord: number
          title: string
        }
        Insert: {
          at: string
          by: string
          id: string
          ord: number
          title: string
        }
        Update: {
          at?: string
          by?: string
          id?: string
          ord?: number
          title?: string
        }
        Relationships: []
      }
      quality_rules: {
        Row: {
          check: string
          dataset_id: string
          description: string
          enabled: boolean
          external_failures: number | null
          id: string
          last_run: string | null
          name: string
          ord: number
          severity: string
        }
        Insert: {
          check: string
          dataset_id: string
          description?: string
          enabled: boolean
          external_failures?: number | null
          id: string
          last_run?: string | null
          name: string
          ord: number
          severity: string
        }
        Update: {
          check?: string
          dataset_id?: string
          description?: string
          enabled?: boolean
          external_failures?: number | null
          id?: string
          last_run?: string | null
          name?: string
          ord?: number
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_rules_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_bodies: {
        Row: {
          enabled: boolean
          key: string
          name: string
          ord: number
          short: string
          website: string
        }
        Insert: {
          enabled: boolean
          key: string
          name: string
          ord: number
          short: string
          website: string
        }
        Update: {
          enabled?: boolean
          key?: string
          name?: string
          ord?: number
          short?: string
          website?: string
        }
        Relationships: []
      }
      ranking_dimensions: {
        Row: {
          name: string
          note: string
          position: number
        }
        Insert: {
          name: string
          note: string
          position: number
        }
        Update: {
          name?: string
          note?: string
          position?: number
        }
        Relationships: []
      }
      ranking_families: {
        Row: {
          band: string
          body: string
          color: string
          key: string
          name: string
          position: number
          soft: string
        }
        Insert: {
          band: string
          body: string
          color: string
          key: string
          name: string
          position: number
          soft: string
        }
        Update: {
          band?: string
          body?: string
          color?: string
          key?: string
          name?: string
          position?: number
          soft?: string
        }
        Relationships: []
      }
      ranking_frameworks: {
        Row: {
          common_errors: string[]
          current_result: string
          data_sources: string[]
          default_deadline: string
          dimensions: string[]
          direction: string
          emphasis: string[]
          family: string
          gaps: string[]
          group_label: string
          interpretation: string
          measures: string
          menu: string[]
          message: string
          methodology_changes: string
          name: string
          opportunities: string[]
          photo: string | null
          position: number
          previous_result: string
          public_note: string
          reporting_period: string
          short: string
          slug: string
          strengths: string[]
          target_result: string
        }
        Insert: {
          common_errors?: string[]
          current_result?: string
          data_sources?: string[]
          default_deadline: string
          dimensions?: string[]
          direction?: string
          emphasis?: string[]
          family: string
          gaps?: string[]
          group_label: string
          interpretation?: string
          measures?: string
          menu?: string[]
          message?: string
          methodology_changes?: string
          name: string
          opportunities?: string[]
          photo?: string | null
          position: number
          previous_result?: string
          public_note?: string
          reporting_period?: string
          short: string
          slug: string
          strengths?: string[]
          target_result?: string
        }
        Update: {
          common_errors?: string[]
          current_result?: string
          data_sources?: string[]
          default_deadline?: string
          dimensions?: string[]
          direction?: string
          emphasis?: string[]
          family?: string
          gaps?: string[]
          group_label?: string
          interpretation?: string
          measures?: string
          menu?: string[]
          message?: string
          methodology_changes?: string
          name?: string
          opportunities?: string[]
          photo?: string | null
          position?: number
          previous_result?: string
          public_note?: string
          reporting_period?: string
          short?: string
          slug?: string
          strengths?: string[]
          target_result?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_frameworks_family_fkey"
            columns: ["family"]
            isOneToOne: false
            referencedRelation: "ranking_families"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ranking_frameworks_photo_fkey"
            columns: ["photo"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["key"]
          },
        ]
      }
      ranking_indicators: {
        Row: {
          definition: string
          formula: string
          lenses: string[]
          metrics: string[]
          name: string
          offices: string[]
          owner: string
          position: number
          ranking_slug: string
          unit: string | null
          weight: string
        }
        Insert: {
          definition?: string
          formula?: string
          lenses?: string[]
          metrics?: string[]
          name: string
          offices?: string[]
          owner?: string
          position: number
          ranking_slug: string
          unit?: string | null
          weight: string
        }
        Update: {
          definition?: string
          formula?: string
          lenses?: string[]
          metrics?: string[]
          name?: string
          offices?: string[]
          owner?: string
          position?: number
          ranking_slug?: string
          unit?: string | null
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_indicators_ranking_slug_fkey"
            columns: ["ranking_slug"]
            isOneToOne: false
            referencedRelation: "ranking_frameworks"
            referencedColumns: ["slug"]
          },
        ]
      }
      ranking_results: {
        Row: {
          best: number | null
          label: string
          ranking_slug: string
          worst: number | null
          year: number
        }
        Insert: {
          best?: number | null
          label: string
          ranking_slug: string
          worst?: number | null
          year: number
        }
        Update: {
          best?: number | null
          label?: string
          ranking_slug?: string
          worst?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "ranking_results_ranking_slug_fkey"
            columns: ["ranking_slug"]
            isOneToOne: false
            referencedRelation: "ranking_frameworks"
            referencedColumns: ["slug"]
          },
        ]
      }
      ranking_settings: {
        Row: {
          deadline: string
          deadline_at: string | null
          deadline_by: string | null
          deadline_source: string | null
          deadline_url: string | null
          enabled: boolean
          ord: number
          public: boolean
          slug: string
        }
        Insert: {
          deadline: string
          deadline_at?: string | null
          deadline_by?: string | null
          deadline_source?: string | null
          deadline_url?: string | null
          enabled: boolean
          ord: number
          public: boolean
          slug: string
        }
        Update: {
          deadline?: string
          deadline_at?: string | null
          deadline_by?: string | null
          deadline_source?: string | null
          deadline_url?: string | null
          enabled?: boolean
          ord?: number
          public?: boolean
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_settings_slug_fkey"
            columns: ["slug"]
            isOneToOne: true
            referencedRelation: "ranking_frameworks"
            referencedColumns: ["slug"]
          },
        ]
      }
      recovery_point_files: {
        Row: {
          bytes: number
          created_at: string
          object_key: string
          point_id: string
          schema: number
          sha256: string
        }
        Insert: {
          bytes: number
          created_at?: string
          object_key: string
          point_id: string
          schema: number
          sha256: string
        }
        Update: {
          bytes?: number
          created_at?: string
          object_key?: string
          point_id?: string
          schema?: number
          sha256?: string
        }
        Relationships: []
      }
      recovery_points: {
        Row: {
          at: string
          checksum: string
          expires_at: string
          file: string | null
          id: string
          kind: string
          location: string
          ord: number
          size_mb: number
          status: string
          verified_at: string | null
        }
        Insert: {
          at: string
          checksum: string
          expires_at: string
          file?: string | null
          id: string
          kind: string
          location: string
          ord: number
          size_mb?: number
          status: string
          verified_at?: string | null
        }
        Update: {
          at?: string
          checksum?: string
          expires_at?: string
          file?: string | null
          id?: string
          kind?: string
          location?: string
          ord?: number
          size_mb?: number
          status?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      recovery_procedures: {
        Row: {
          id: string
          ord: number
          owner: string
          steps: string[]
          title: string
          updated: string
        }
        Insert: {
          id: string
          ord: number
          owner: string
          steps?: string[]
          title: string
          updated: string
        }
        Update: {
          id?: string
          ord?: number
          owner?: string
          steps?: string[]
          title?: string
          updated?: string
        }
        Relationships: []
      }
      reference_lists: {
        Row: {
          color: string | null
          list: string
          note: string | null
          position: number
          value: string
        }
        Insert: {
          color?: string | null
          list: string
          note?: string | null
          position: number
          value: string
        }
        Update: {
          color?: string | null
          list?: string
          note?: string | null
          position?: number
          value?: string
        }
        Relationships: []
      }
      reporting_cycles: {
        Row: {
          id: string
          ord: number
          status: string
        }
        Insert: {
          id: string
          ord: number
          status: string
        }
        Update: {
          id?: string
          ord?: number
          status?: string
        }
        Relationships: []
      }
      reporting_periods: {
        Row: {
          accepting: boolean
          id: string
          label: string
          note: string
          ord: number
        }
        Insert: {
          accepting: boolean
          id: string
          label: string
          note?: string
          ord: number
        }
        Update: {
          accepting?: boolean
          id?: string
          label?: string
          note?: string
          ord?: number
        }
        Relationships: []
      }
      requirement_values: {
        Row: {
          at: string
          by: string
          requirement_id: string
          source: string
          status: string
          value: string
        }
        Insert: {
          at: string
          by: string
          requirement_id: string
          source?: string
          status: string
          value: string
        }
        Update: {
          at?: string
          by?: string
          requirement_id?: string
          source?: string
          status?: string
          value?: string
        }
        Relationships: []
      }
      restore_tests: {
        Row: {
          at: string
          by: string
          id: string
          minutes: number
          notes: string
          ord: number
          point_id: string
          result: string
        }
        Insert: {
          at: string
          by: string
          id: string
          minutes?: number
          notes?: string
          ord: number
          point_id: string
          result: string
        }
        Update: {
          at?: string
          by?: string
          id?: string
          minutes?: number
          notes?: string
          ord?: number
          point_id?: string
          result?: string
        }
        Relationships: []
      }
      sdg_goals: {
        Row: {
          color: string
          icon: string | null
          name: string
          number: number
        }
        Insert: {
          color: string
          icon?: string | null
          name: string
          number: number
        }
        Update: {
          color?: string
          icon?: string | null
          name?: string
          number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sdg_goals_icon_fkey"
            columns: ["icon"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["key"]
          },
        ]
      }
      secret_keys: {
        Row: {
          algorithm: string
          created: string
          id: string
          name: string
          ord: number
          purpose: string
          rotated: string
          rotation_days: number
        }
        Insert: {
          algorithm: string
          created: string
          id: string
          name: string
          ord: number
          purpose: string
          rotated: string
          rotation_days: number
        }
        Update: {
          algorithm?: string
          created?: string
          id?: string
          name?: string
          ord?: number
          purpose?: string
          rotated?: string
          rotation_days?: number
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          account_id: string | null
          at: string
          detail: string
          id: string
          kind: string
          ord: number
          severity: string
          status: string
        }
        Insert: {
          account_id?: string | null
          at: string
          detail: string
          id: string
          kind: string
          ord: number
          severity: string
          status: string
        }
        Update: {
          account_id?: string | null
          at?: string
          detail?: string
          id?: string
          kind?: string
          ord?: number
          severity?: string
          status?: string
        }
        Relationships: []
      }
      security_policy: {
        Row: {
          encryption_at_rest: string
          encryption_in_transit: string
          encryption_secrets_manager: string
          export_approval_for: string[]
          export_blocked: string[]
          export_watermark: boolean
          id: number
          inactivity_days: number
          lockout_attempts: number
          lockout_window_minutes: number
          mfa_methods: string[]
          mfa_mode: string
          mfa_roles: string[]
          privacy_breach_hours: number
          privacy_email: string
          privacy_notice_updated: string
          privacy_officer: string
          session_absolute_hours: number
          session_idle_minutes: number
          session_warn_minutes: number
          sharing_external_links: boolean
          sharing_guest_downloads: boolean
          sso_allow_guests: boolean
          sso_domains: string[]
          sso_enforced: boolean
          sso_provider: string
        }
        Insert: {
          encryption_at_rest: string
          encryption_in_transit: string
          encryption_secrets_manager: string
          export_approval_for?: string[]
          export_blocked?: string[]
          export_watermark: boolean
          id?: number
          inactivity_days: number
          lockout_attempts: number
          lockout_window_minutes: number
          mfa_methods?: string[]
          mfa_mode: string
          mfa_roles?: string[]
          privacy_breach_hours: number
          privacy_email: string
          privacy_notice_updated: string
          privacy_officer: string
          session_absolute_hours: number
          session_idle_minutes: number
          session_warn_minutes: number
          sharing_external_links: boolean
          sharing_guest_downloads: boolean
          sso_allow_guests: boolean
          sso_domains?: string[]
          sso_enforced: boolean
          sso_provider: string
        }
        Update: {
          encryption_at_rest?: string
          encryption_in_transit?: string
          encryption_secrets_manager?: string
          export_approval_for?: string[]
          export_blocked?: string[]
          export_watermark?: boolean
          id?: number
          inactivity_days?: number
          lockout_attempts?: number
          lockout_window_minutes?: number
          mfa_methods?: string[]
          mfa_mode?: string
          mfa_roles?: string[]
          privacy_breach_hours?: number
          privacy_email?: string
          privacy_notice_updated?: string
          privacy_officer?: string
          session_absolute_hours?: number
          session_idle_minutes?: number
          session_warn_minutes?: number
          sharing_external_links?: boolean
          sharing_guest_downloads?: boolean
          sso_allow_guests?: boolean
          sso_domains?: string[]
          sso_enforced?: boolean
          sso_provider?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          account_id: string
          created_at: string
          device: string
          id: string
          last_seen: string
          mfa: boolean
          ord: number
        }
        Insert: {
          account_id: string
          created_at: string
          device?: string
          id: string
          last_seen: string
          mfa?: boolean
          ord: number
        }
        Update: {
          account_id?: string
          created_at?: string
          device?: string
          id?: string
          last_seen?: string
          mfa?: boolean
          ord?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_challenges: {
        Row: {
          account_id: string
          attempts: number
          created_at: string
          id: string
          next: string
          ord: number
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at: string
          id: string
          next: string
          ord: number
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string
          id?: string
          next?: string
          ord?: number
        }
        Relationships: [
          {
            foreignKeyName: "sign_in_challenges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_failures: {
        Row: {
          at: string
          email: string
          ord: number
        }
        Insert: {
          at: string
          email: string
          ord: number
        }
        Update: {
          at?: string
          email?: string
          ord?: number
        }
        Relationships: []
      }
      site_process_stages: {
        Row: {
          body: string
          count_label: string
          name: string
          photo: string
          position: number
        }
        Insert: {
          body: string
          count_label: string
          name: string
          photo: string
          position: number
        }
        Update: {
          body?: string
          count_label?: string
          name?: string
          photo?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_process_stages_photo_fkey"
            columns: ["photo"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["key"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: number
          latest_edition: number
        }
        Insert: {
          id?: number
          latest_edition: number
        }
        Update: {
          id?: number
          latest_edition?: number
        }
        Relationships: []
      }
      story_proposals: {
        Row: {
          at: string
          by: string
          challenge: string
          ord: number
          outcome: string
          rankings: string[]
          sdgs: number[]
          slug: string
          title: string
          unit_id: string
        }
        Insert: {
          at: string
          by: string
          challenge?: string
          ord: number
          outcome?: string
          rankings?: string[]
          sdgs?: number[]
          slug: string
          title: string
          unit_id: string
        }
        Update: {
          at?: string
          by?: string
          challenge?: string
          ord?: number
          outcome?: string
          rankings?: string[]
          sdgs?: number[]
          slug?: string
          title?: string
          unit_id?: string
        }
        Relationships: []
      }
      story_states: {
        Row: {
          slug: string
          state: string
        }
        Insert: {
          slug: string
          state: string
        }
        Update: {
          slug?: string
          state?: string
        }
        Relationships: []
      }
      subject_requests: {
        Row: {
          due: string
          handler_id: string
          id: string
          note: string | null
          ord: number
          received: string
          status: string
          subject: string
          type: string
        }
        Insert: {
          due: string
          handler_id: string
          id: string
          note?: string | null
          ord: number
          received: string
          status: string
          subject: string
          type: string
        }
        Update: {
          due?: string
          handler_id?: string
          id?: string
          note?: string | null
          ord?: number
          received?: string
          status?: string
          subject?: string
          type?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          dashboard_deadline_warning_days: number
          dashboard_office_view: string
          dashboard_show_clock: boolean
          id: number
          post_views_since: string
          site_as_of: string
          site_notice: string
          site_notice_on: boolean
          upload_max_file_mb: number
          upload_max_files: number
          upload_types: string[]
        }
        Insert: {
          dashboard_deadline_warning_days: number
          dashboard_office_view: string
          dashboard_show_clock: boolean
          id?: number
          post_views_since: string
          site_as_of: string
          site_notice?: string
          site_notice_on?: boolean
          upload_max_file_mb: number
          upload_max_files: number
          upload_types?: string[]
        }
        Update: {
          dashboard_deadline_warning_days?: number
          dashboard_office_view?: string
          dashboard_show_clock?: boolean
          id?: number
          post_views_since?: string
          site_as_of?: string
          site_notice?: string
          site_notice_on?: boolean
          upload_max_file_mb?: number
          upload_max_files?: number
          upload_types?: string[]
        }
        Relationships: []
      }
      term_stewardship: {
        Row: {
          dataset_id: string
          definition: string | null
          ord: number
          steward_id: string
          term: string
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          dataset_id: string
          definition?: string | null
          ord: number
          steward_id?: string
          term: string
          unit_of_measure?: string
          updated_at: string
        }
        Update: {
          dataset_id?: string
          definition?: string | null
          ord?: number
          steward_id?: string
          term?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_stewardship_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_directory: {
        Row: {
          category: string
          emails: string[]
          key: string
          name: string
          parent_key: string | null
          position: number
        }
        Insert: {
          category: string
          emails?: string[]
          key: string
          name: string
          parent_key?: string | null
          position: number
        }
        Update: {
          category?: string
          emails?: string[]
          key?: string
          name?: string
          parent_key?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "unit_directory_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "unit_directory"
            referencedColumns: ["key"]
          },
        ]
      }
      unit_emblems: {
        Row: {
          archive_url: string | null
          file_path: string
          form: string
          height: number
          license: string
          retrieved_at: string
          sha256: string
          source: string
          source_page: string
          source_url: string
          unit_key: string
          updated_at: string
          width: number
        }
        Insert: {
          archive_url?: string | null
          file_path: string
          form: string
          height: number
          license: string
          retrieved_at: string
          sha256: string
          source: string
          source_page: string
          source_url: string
          unit_key: string
          updated_at?: string
          width: number
        }
        Update: {
          archive_url?: string | null
          file_path?: string
          form?: string
          height?: number
          license?: string
          retrieved_at?: string
          sha256?: string
          source?: string
          source_page?: string
          source_url?: string
          unit_key?: string
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          name: string
          ord: number
          workflow_id: string
        }
        Insert: {
          name: string
          ord: number
          workflow_id: string
        }
        Update: {
          name?: string
          ord?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          description: string
          enabled: boolean
          id: string
          name: string
          ord: number
          separation: boolean
          sla_days: number
        }
        Insert: {
          description?: string
          enabled: boolean
          id: string
          name: string
          ord: number
          separation: boolean
          sla_days: number
        }
        Update: {
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          ord?: number
          separation?: boolean
          sla_days?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hub_before_user_created: { Args: { event: Json }; Returns: Json }
      hub_columns: {
        Args: { p_keys: boolean; p_table: string }
        Returns: string[]
      }
      hub_commit: {
        Args: {
          p_audit: Json
          p_deletes: Json
          p_schema: number
          p_upserts: Json
          p_version: number
        }
        Returns: number
      }
      hub_count_post_view: {
        Args: {
          p_day: string
          p_slug: string
          p_visitor: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      hub_rate_hit: {
        Args: {
          p_count?: boolean
          p_key: string
          p_max: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      hub_snapshot: { Args: { p_recent_since: string }; Returns: Json }
      hub_table: { Args: { p_name: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
