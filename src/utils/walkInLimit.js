export const DEFAULT_WALK_IN_LIMIT = 20;
export function getWalkInLimit(data) {
    const value = data?.dailyLimit;
    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_WALK_IN_LIMIT;
}
