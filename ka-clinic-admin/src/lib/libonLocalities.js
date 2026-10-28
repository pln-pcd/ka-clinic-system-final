// Verified locality names, not a complete municipal purok register.
// Add an entry only with a source identifying both Libon and its barangay.
// Never infer Puroks 1..N from one numbered address or reuse another town's list.
const DEPED_2019 = 'https://www.deped.gov.ph/wp-content/uploads/2019/10/Annex-A-Recipient-List.pdf';
const DEPED_2020 = 'https://www.deped.gov.ph/wp-content/uploads/2020/10/PBD_Annex_E_Recipients_Advanced_Copies1.pdf';
const DEPED_2021 = 'https://www.deped.gov.ph/wp-content/uploads/2021/12/Annex-L.-2.-B_Allocation-List-SME-2022-Package-per-School_compressed.pdf';
const locality = (name, source) => ({ name, source });

export const LIBON_LOCALITIES = {
  Alongong: [locality('Purok 5', DEPED_2019)],
  Bariw: [locality('Zone 4', DEPED_2019)],
  Bonbon: [locality('Purok Lanzones', DEPED_2020), locality('Purok Narra', DEPED_2019)],
  Buga: [locality('Sitio Pinagbadilan', DEPED_2020), locality('Zone 3', DEPED_2019)],
  Bulusan: [locality('Zone 2', DEPED_2019)],
  Caguscos: [locality('Zone 3', DEPED_2019)],
  'East Carisac': [
    locality('Purok 2', 'https://pcic.gov.ph/wp-content/uploads/2018/03/CLTI-ALL-PROGRAM-RO5.pdf'),
    locality('Zone 6', 'https://www.deped.gov.ph/wp-content/uploads/2021/06/SY-2020-2021-Masterlist-of-Schools-Address-only-1-1.pdf'),
  ],
  Harigue: [locality('Zone 2, Purok Rose', DEPED_2019)],
  Macabugos: [locality('Purok 9, Balinsayawan', DEPED_2020), locality('Sitio Tagbac', DEPED_2019)],
  Malabiga: [locality('Purok 3', 'https://www.deped.gov.ph/wp-content/uploads/2019/10/PBD_DCP_CCS_merged.pdf')],
  'Niño Jesus': [locality('Purok 3', DEPED_2020)],
  Nogpo: [locality('Zone 3, Purok Bayanihan', DEPED_2019)],
  Pantao: [locality('Dalagang Bukid', DEPED_2021), locality('Purok Lapu-Lapu', DEPED_2020), locality('Sitio Pintason', DEPED_2020)],
  Rawis: [locality('Purok Mangga', DEPED_2020)],
  'Sagrada Familia': [locality('Zone 2', DEPED_2020)],
  'San Isidro': [locality('Purok 7', 'https://pcic.gov.ph/wp-content/uploads/2016/11/REGION-V-RICE.pdf')],
  'San Jose': [locality('Purok Avocado', DEPED_2020)],
  'San Vicente': [locality('Purok 4', DEPED_2021)],
  'Talin-talin': [locality('Purok Mangga', DEPED_2019)],
  'Villa Petrona': [locality('Zone 4', DEPED_2019)],
};

export function libonLocalities(barangay) {
  return (LIBON_LOCALITIES[barangay] || []).map(entry => entry.name);
}
