// A category is shown only once ten rated games qualify it. Until then,
// show the qualified overall rating (or calibration when there is none).
export async function ownModeRating(client, mode) {
  const get = async selected => {
    const {data, error} = await client.rpc('rank_my_position', {p_mode:selected});
    if (error || !Array.isArray(data) || !data[0]) throw error || Error('rating unavailable');
    return data[0];
  };
  if (!mode) return get('overall');
  const category = await get(mode);
  return category.ranked ? category : get('overall');
}
