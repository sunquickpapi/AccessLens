import * as Location from 'expo-location';

const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
const asCoords = (pos) => (pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy } : null);

// The phone's location right now, or null if the resident said no / it failed.
// Never waits more than ~12 s: indoors GPS can be slow, so we fall back to the
// last known position, and the resident can still move the pin.
export async function currentPosition() {
  try {
    const perm = await within(Location.requestForegroundPermissionsAsync(), 30000);
    if (!perm?.granted) return null;
    const pos = await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), 10000);
    if (pos) return asCoords(pos);
    return asCoords(await within(Location.getLastKnownPositionAsync().catch(() => null), 2000));
  } catch {
    return null;
  }
}

export async function addressFor(coords) {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
    if (!a) return null;
    const parts = [];
    [a.name, a.street, a.district || a.subregion, a.city].filter(Boolean).forEach((p) => {
      // skip repeats such as "291B, Jalan Bujang 3/4" followed by "Jalan Bujang 3/4"
      if (!parts.some((q) => q.toLowerCase().includes(p.toLowerCase()))) parts.push(p);
    });
    return parts.join(', ');
  } catch {
    return null;
  }
}
