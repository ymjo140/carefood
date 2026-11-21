/** 같은 음식 묶기 (lib/dish-family) */
import { describe, expect, it } from "vitest";
import { dishFamily } from "@/lib/dish-family";

describe("dishFamily", () => {
  it("맛 이름만 다른 국은 같은 음식", () => {
    expect(dishFamily("한식온도 사골 순대국")).toBe("순대국");
    expect(dishFamily("한식온도 얼큰 순대국")).toBe("순대국");
  });
  it("상표·용량·덧붙인 말을 뗀다", () => {
    expect(dishFamily("이지끼니 백미없는 순잡곡밥 프로틴")).toBe("순잡곡밥");
    expect(dishFamily("[KF365] 한돈 고추장 불고기 500g")).toBe("불고기");
    expect(dishFamily("햇반 현미귀리밥 210g x 12개")).toBe("현미귀리밥");
  });
  it("다른 음식은 다르게", () => {
    expect(dishFamily("닭볶음탕")).not.toBe(dishFamily("한우 소고기무국"));
    expect(dishFamily("메추리알장조림")).not.toBe(dishFamily("꽈리고추무침"));
  });
  it("두부·달걀은 이름이 달라도 같은 음식 (순두부는 다르게)", () => {
    expect(dishFamily("하늘이 내린 두부")).toBe("두부");
    expect(dishFamily("국산 담백 쌈두부")).toBe("두부");
    expect(dishFamily("사토노유키 실큰두부")).toBe("두부");
    expect(dishFamily("반숙란")).toBe("달걀");
    expect(dishFamily("순두부")).not.toBe("두부");
  });
  it("'○○란' 달걀 — 참숯란·청라초란구운계란·유정란은 같은 음식, 명란·사프란은 아니다", () => {
    for (const n of ["참숯란", "청라초란구운계란", "곰곰 깐 메추리 유정란", "오메가반숙란", "정직한훈제란", "동물복지구운란", "흥생농장반숙계란"]) expect(dishFamily(n)).toBe("달걀");
    for (const n of ["구워먹는 명란", "리조또 사프란", "기역이미음김칩스쯔란", "누룽지의 반란"]) expect(dishFamily(n)).not.toBe("달걀");
  });
  it("제조사 이름이 앞에 붙어도", () => {
    expect(dishFamily("오뚜기 쇠고기미역국", "오뚜기")).toBe("쇠고기미역국");
  });
});
