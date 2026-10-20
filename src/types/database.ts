// Supabase 자동 생성 타입 placeholder
// 실제 프로젝트에서는 npx supabase gen types typescript 으로 생성
// 지금은 수동 정의

export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          food_code: string | null;
          name: string;
          manufacturer: string | null;
          category_large: string | null;
          food_type: string | null;
          meal_type: string | null;
          serving_size_g: number | null;
          calories: number | null;
          protein_g: number | null;
          fat_g: number | null;
          saturated_fat_g: number | null;
          trans_fat_g: number | null;
          carbs_g: number | null;
          sugar_g: number | null;
          fiber_g: number | null;
          sodium_mg: number | null;
          cholesterol_mg: number | null;
          ingredients_raw: string | null;
          spicy_score: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["products"]["Row"], "id" | "created_at" | "updated_at" | "is_active" | "spicy_score"> & {
          id?: string;
          spicy_score?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      product_prices: {
        Row: {
          id: string;
          product_id: string;
          platform: string;
          price: number | null;
          price_per_serving: number | null;
          url: string;
          image_url: string | null;
          is_available: boolean;
          last_crawled_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["product_prices"]["Row"], "id" | "last_crawled_at" | "is_available"> & {
          id?: string;
          is_available?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["product_prices"]["Insert"]>;
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          nickname: string | null;
          birth_year: number | null;
          gender: string | null;
          household_size: number;
          tier: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "id" | "created_at" | "household_size" | "tier"> & {
          id?: string;
          household_size?: number;
          tier?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      user_taste_profiles: {
        Row: {
          id: string;
          user_id: string;
          salty_level: number;
          sweet_level: number;
          spicy_level: number;
          fatty_level: number;
          preferred_food_types: string[] | null;
          preferred_meal_types: string[] | null;
          excluded_ingredients: string[] | null;
          budget_per_meal: number | null;
          has_microwave: boolean;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["user_taste_profiles"]["Row"], "id" | "updated_at" | "has_microwave"> & {
          id?: string;
          has_microwave?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["user_taste_profiles"]["Insert"]>;
      };
      default_taste_mappings: {
        Row: {
          id: string;
          taste_dimension: string;
          level: number;
          nutrient_min: number;
          nutrient_max: number;
          nutrient_unit: string;
        };
        Insert: Omit<Database["public"]["Tables"]["default_taste_mappings"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["default_taste_mappings"]["Insert"]>;
      };
      taste_feedback: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          dimension: string;
          rating: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["taste_feedback"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["taste_feedback"]["Insert"]>;
      };
      safety_rules: {
        Row: {
          id: string;
          condition: string;
          nutrient: string;
          max_per_serving: number;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["safety_rules"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["safety_rules"]["Insert"]>;
      };
      user_health_profiles: {
        Row: {
          id: string;
          user_id: string;
          conditions: string[];
          allergies: string[];
          pregnancy_stage: string | null;
          health_goal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["user_health_profiles"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["user_health_profiles"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// 편의 타입
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductPrice = Database["public"]["Tables"]["product_prices"]["Row"];
export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserTasteProfile = Database["public"]["Tables"]["user_taste_profiles"]["Row"];
export type TasteFeedback = Database["public"]["Tables"]["taste_feedback"]["Row"];
export type DefaultTasteMapping = Database["public"]["Tables"]["default_taste_mappings"]["Row"];
export type SafetyRule = Database["public"]["Tables"]["safety_rules"]["Row"];
export type UserHealthProfile = Database["public"]["Tables"]["user_health_profiles"]["Row"];

// 페르소나 타입
export type Persona = "elderly" | "patient" | "pregnant" | "general";
export type OrdererRelation = "self" | "child" | "spouse" | "caregiver" | "other";

// 온보딩 프로필 (localStorage 저장용)
export type OnboardingProfile = {
  persona: Persona;
  ordererRelation: OrdererRelation;
  conditions: string[];
  allergies: string[];
  pregnancyStage: string;
  healthGoal: string;
  tastes: {
    salty: number;
    sweet: number;
    spicy: number;
    fatty: number;
  };
};

// 통합 가격 정보 (v_all_prices 뷰에서)
export type MallPrice = {
  platform: string;
  price: number;
  url: string;
  image_url: string | null;
};

// 제품 + 가격 조인 타입
export type ProductWithPrices = Product & {
  product_prices: (ProductPrice | MallPrice)[];
};

// 맛 레벨 타입
export type TasteLevel = 1 | 2 | 3 | 4 | 5;
export type TasteDimension = "salty" | "sweet" | "spicy" | "fatty";
export type FeedbackRating = "too_much" | "just_right" | "too_little";
