// Saves a captured card image (e.g. from react-native-view-shot) into the
// device photo gallery under a "K&A Clinic" album. Asks for the write-only
// photos permission on first use; throws a readable error when denied so the
// caller can surface it in the alert modal.
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

const ALBUM_NAME = 'K&A Clinic';

export async function saveImageToGallery(uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Saving to the gallery is only available in the mobile app.');
  }

  // writeOnly: we never need to read the user's photos, only add one.
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  if (status !== 'granted') {
    throw new Error('Photo library permission was denied. Allow photo access in Settings to save your card.');
  }

  const asset = await MediaLibrary.createAssetAsync(uri);
  try {
    const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
    }
  } catch {
    // Album grouping is a nicety; the asset is already saved to the gallery.
  }
}
