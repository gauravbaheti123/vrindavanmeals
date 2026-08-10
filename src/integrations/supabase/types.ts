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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string
          id: string
          is_override: boolean
          marked_by: string | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          override_reason: string | null
          scan_date: string | null
          scan_time: string
          scan_type: Database["public"]["Enums"]["scan_type"]
          student_id: string
          token_number: number
          token_printed: boolean
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_override?: boolean
          marked_by?: string | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          override_reason?: string | null
          scan_date?: string | null
          scan_time?: string
          scan_type?: Database["public"]["Enums"]["scan_type"]
          student_id: string
          token_number: number
          token_printed?: boolean
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_override?: boolean
          marked_by?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          override_reason?: string | null
          scan_date?: string | null
          scan_time?: string
          scan_type?: Database["public"]["Enums"]["scan_type"]
          student_id?: string
          token_number?: number
          token_printed?: boolean
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_backfill_log: {
        Row: {
          after_billed: number
          before_billed: number
          created_at: string
          id: string
          run_at: string
          student_id: string
        }
        Insert: {
          after_billed?: number
          before_billed?: number
          created_at?: string
          id?: string
          run_at?: string
          student_id: string
        }
        Update: {
          after_billed?: number
          before_billed?: number
          created_at?: string
          id?: string
          run_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_backfill_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_mappings: {
        Row: {
          created_at: string
          device_name: string | null
          device_user_id: string
          id: string
          is_active: boolean
          mapped_at: string | null
          mapped_by: string | null
          student_id: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          device_user_id: string
          id?: string
          is_active?: boolean
          mapped_at?: string | null
          mapped_by?: string | null
          student_id?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          device_user_id?: string
          id?: string
          is_active?: boolean
          mapped_at?: string | null
          mapped_by?: string | null
          student_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_mappings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_mappings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_settings: {
        Row: {
          created_at: string
          created_by: string | null
          effective_month: string
          effective_to_month: string | null
          id: string
          is_active: boolean
          monthly_fee: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_month: string
          effective_to_month?: string | null
          id?: string
          is_active?: boolean
          monthly_fee: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_month?: string
          effective_to_month?: string | null
          id?: string
          is_active?: boolean
          monthly_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_at: string
          error_report: Json | null
          error_rows: number
          file_name: string | null
          id: string
          import_type: string
          imported_by: string | null
          imported_rows: number
          skipped_rows: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          error_report?: Json | null
          error_rows?: number
          file_name?: string | null
          id?: string
          import_type: string
          imported_by?: string | null
          imported_rows?: number
          skipped_rows?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          error_report?: Json | null
          error_rows?: number
          file_name?: string | null
          id?: string
          import_type?: string
          imported_by?: string | null
          imported_rows?: number
          skipped_rows?: number
          total_rows?: number
        }
        Relationships: []
      }
      ledger_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          remarks: string | null
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          remarks?: string | null
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          remarks?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_adjustments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_windows: {
        Row: {
          end_time: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          start_time: string
          unit_id: string
        }
        Insert: {
          end_time: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          start_time: string
          unit_id: string
        }
        Update: {
          end_time?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          start_time?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_windows_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          created_at: string
          id: string
          mobile: string
          response_data: Json | null
          sent_at: string
          status: string
          student_id: string | null
          template_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          mobile: string
          response_data?: Json | null
          sent_at?: string
          status?: string
          student_id?: string | null
          template_name: string
        }
        Update: {
          created_at?: string
          id?: string
          mobile?: string
          response_data?: Json | null
          sent_at?: string
          status?: string
          student_id?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["payment_mode"]
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mode: Database["public"]["Enums"]["payment_mode"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["payment_mode"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_items: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payment_modes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      pos_sale_items: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          line_total: number
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          line_total?: number
          quantity?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          line_total?: number
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          payment_mode: string
          sale_number: number
          sold_at: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          payment_mode: string
          sale_number?: number
          sold_at?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          payment_mode?: string
          sale_number?: number
          sold_at?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_rate_limit: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_access: boolean
          id: string
          module_name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_access?: boolean
          id?: string
          module_name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_access?: boolean
          id?: string
          module_name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      students: {
        Row: {
          address: string | null
          batch_year: number | null
          blood_group: string | null
          college_roll_number: string | null
          course: string | null
          created_at: string
          doc_number: string | null
          doc_type: Database["public"]["Enums"]["doc_type"] | null
          doc_url: string | null
          email: string | null
          exit_date: string | null
          full_name: string
          hostel_room: string | null
          id: string
          is_approved: boolean
          joining_date: string | null
          mobile: string | null
          opening_balance: number
          opening_balance_as_of: string | null
          parent_mobile: string | null
          photo_url: string | null
          roll_number: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          batch_year?: number | null
          blood_group?: string | null
          college_roll_number?: string | null
          course?: string | null
          created_at?: string
          doc_number?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"] | null
          doc_url?: string | null
          email?: string | null
          exit_date?: string | null
          full_name: string
          hostel_room?: string | null
          id?: string
          is_approved?: boolean
          joining_date?: string | null
          mobile?: string | null
          opening_balance?: number
          opening_balance_as_of?: string | null
          parent_mobile?: string | null
          photo_url?: string | null
          roll_number?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          batch_year?: number | null
          blood_group?: string | null
          college_roll_number?: string | null
          course?: string | null
          created_at?: string
          doc_number?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"] | null
          doc_url?: string | null
          email?: string | null
          exit_date?: string | null
          full_name?: string
          hostel_room?: string | null
          id?: string
          is_approved?: boolean
          joining_date?: string | null
          mobile?: string | null
          opening_balance?: number
          opening_balance_as_of?: string | null
          parent_mobile?: string | null
          photo_url?: string | null
          roll_number?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          meal_combo: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          meal_combo?: string
          name: string
          price?: number
        }
        Update: {
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          meal_combo?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billed_amount: number | null
          created_at: string
          end_date: string
          grace_end_date: string
          id: string
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          student_id: string
          unit_id: string | null
        }
        Insert: {
          billed_amount?: number | null
          created_at?: string
          end_date: string
          grace_end_date: string
          id?: string
          plan_id: string
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"]
          student_id: string
          unit_id?: string | null
        }
        Update: {
          billed_amount?: number | null
          created_at?: string
          end_date?: string
          grace_end_date?: string
          id?: string
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          student_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      token_reprints: {
        Row: {
          attendance_id: string
          created_at: string
          id: string
          reason: string | null
          reprinted_by: string | null
        }
        Insert: {
          attendance_id: string
          created_at?: string
          id?: string
          reason?: string | null
          reprinted_by?: string | null
        }
        Update: {
          attendance_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          reprinted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_reprints_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      unmapped_scans: {
        Row: {
          created_at: string
          device_user_id: string
          id: string
          raw_data: Json | null
          resolved: boolean
          scan_time: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          device_user_id: string
          id?: string
          raw_data?: Json | null
          resolved?: boolean
          scan_time?: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          device_user_id?: string
          id?: string
          raw_data?: Json | null
          resolved?: boolean
          scan_time?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmapped_scans_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      accrue_monthly_billing: { Args: never; Returns: number }
      fee_for_month: { Args: { p_month: string }; Returns: number }
      rebuild_all_billing: {
        Args: never
        Returns: {
          after_total: number
          before_total: number
          students_processed: number
        }[]
      }
      rebuild_student_billing: { Args: { p_student: string }; Returns: number }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "counter_staff" | "accountant"
      doc_type: "college_id" | "aadhar"
      meal_type: "lunch" | "dinner"
      payment_mode:
        | "cash"
        | "upi"
        | "card"
        | "razorpay"
        | "rtgs"
        | "bank_transfer"
      payment_status: "success" | "failed" | "pending"
      scan_type: "biometric" | "manual"
      subscription_status: "active" | "grace" | "expired" | "pending"
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
    Enums: {
      app_role: ["super_admin", "manager", "counter_staff", "accountant"],
      doc_type: ["college_id", "aadhar"],
      meal_type: ["lunch", "dinner"],
      payment_mode: [
        "cash",
        "upi",
        "card",
        "razorpay",
        "rtgs",
        "bank_transfer",
      ],
      payment_status: ["success", "failed", "pending"],
      scan_type: ["biometric", "manual"],
      subscription_status: ["active", "grace", "expired", "pending"],
    },
  },
} as const
