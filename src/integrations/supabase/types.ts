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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          context: Json | null
          created_at: string
          id: string
          parts: Json
          role: string
          session_id: string
        }
        Insert: {
          content?: string
          context?: Json | null
          created_at?: string
          id?: string
          parts?: Json
          role: string
          session_id: string
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          is_saved: boolean
          tenant_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_saved?: boolean
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_saved?: boolean
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          embedding_model: string
          event_id: string
          indexed_at: string
        }
        Insert: {
          content_hash: string
          embedding: string
          embedding_model: string
          event_id: string
          indexed_at?: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          embedding_model?: string
          event_id?: string
          indexed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_embeddings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          audience: string[]
          category: string
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string
          end_at: string | null
          format: string
          id: string
          index_error: string | null
          index_status: string
          is_free: boolean
          registration_url: string | null
          search_tsv: unknown
          start_at: string
          status: string
          summary: string
          technologies: string[]
          tenant_id: string | null
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          audience?: string[]
          category: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_at?: string | null
          format: string
          id?: string
          index_error?: string | null
          index_status?: string
          is_free?: boolean
          registration_url?: string | null
          search_tsv?: unknown
          start_at: string
          status?: string
          summary?: string
          technologies?: string[]
          tenant_id?: string | null
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          audience?: string[]
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_at?: string | null
          format?: string
          id?: string
          index_error?: string | null
          index_status?: string
          is_free?: boolean
          registration_url?: string | null
          search_tsv?: unknown
          start_at?: string
          status?: string
          summary?: string
          technologies?: string[]
          tenant_id?: string | null
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string | null
          query: string | null
          rating: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          query?: string | null
          rating: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          query?: string | null
          rating?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_dashboards: {
        Row: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          tenant_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          configuration: Json
          created_at?: string
          id?: string
          name: string
          owner_id: string
          tenant_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          tenant_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_dashboards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          client_key: string | null
          created_at: string
          error_category: string | null
          filters: Json | null
          id: string
          intent: string | null
          latency_ms: number | null
          low_confidence: boolean
          query: string
          result_count: number
          session_id: string | null
          status: string
          tenant_id: string | null
          top_score: number | null
          user_id: string | null
        }
        Insert: {
          client_key?: string | null
          created_at?: string
          error_category?: string | null
          filters?: Json | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          low_confidence?: boolean
          query: string
          result_count?: number
          session_id?: string | null
          status?: string
          tenant_id?: string | null
          top_score?: number | null
          user_id?: string | null
        }
        Update: {
          client_key?: string | null
          created_at?: string
          error_category?: string | null
          filters?: Json | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          low_confidence?: boolean
          query?: string
          result_count?: number
          session_id?: string | null
          status?: string
          tenant_id?: string | null
          top_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_avatar_folder: { Args: { _folder: string }; Returns: boolean }
      event_facets: { Args: { workspace_id: string }; Returns: Json }
      get_events_by_ids: {
        Args: { event_ids: string[]; workspace_id: string }
        Returns: {
          audience: string[]
          category: string
          city: string
          country: string
          description: string
          end_at: string
          format: string
          id: string
          is_free: boolean
          registration_url: string
          start_at: string
          summary: string
          technologies: string[]
          tenant_id: string
          title: string
          venue: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["tenant_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      search_events: {
        Args: {
          filter_categories: string[]
          filter_city: string
          filter_end: string
          filter_formats: string[]
          filter_start: string
          filter_technologies: string[]
          keyword_query: string
          match_count?: number
          query_embedding: string
          workspace_id: string
        }
        Returns: {
          audience: string[]
          category: string
          city: string
          country: string
          description: string
          end_at: string
          format: string
          id: string
          is_free: boolean
          keyword_score: number
          registration_url: string
          semantic_score: number
          start_at: string
          summary: string
          technologies: string[]
          tenant_id: string
          title: string
          venue: string
        }[]
      }
      shares_tenant: { Args: { _a: string; _b: string }; Returns: boolean }
    }
    Enums: {
      app_role: "platform_admin"
      tenant_role: "owner" | "admin" | "editor" | "member" | "viewer"
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
    Enums: {
      app_role: ["platform_admin"],
      tenant_role: ["owner", "admin", "editor", "member", "viewer"],
    },
  },
} as const
