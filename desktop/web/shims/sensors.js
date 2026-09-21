/** No magnetometer on a desktop: the compass reports that it has no sensor. */
const never = { subscribe: () => ({ unsubscribe() {} }), pipe: () => never };
export const magnetometer = never;
export const accelerometer = never;
export const gyroscope = never;
export const orientation = never;
export const SensorTypes = {};
export const setUpdateIntervalForType = () => {};
