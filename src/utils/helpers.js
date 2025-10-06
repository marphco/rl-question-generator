// src/utils/helpers.js
export function isRepeated(question, previousQuestions) {
    const qLower = question.toLowerCase().trim();
    return previousQuestions.some(prev => {
      const pLower = prev.toLowerCase().trim();
      return qLower === pLower || (qLower.length > 5 && pLower.includes(qLower.slice(0, -2)));
    });
  }
  
  export function areOptionsDistinct(options) {
    if (options === 'text-area') return true;
    const uniqueOptions = new Set(options.map(opt => opt.toLowerCase().trim()));
    return uniqueOptions.size === options.length;
  }
  
//   // Funzione di similarità leggera (Jaro-Winkler semplificato)
//   function calculateSimilarity(str1, str2) {
//     const len1 = str1.length;
//     const len2 = str2.length;
//     if (len1 === 0 && len2 === 0) return 1;
//     if (len1 === 0 || len2 === 0) return 0;
  
//     const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
//     let matches = 0;
//     const used1 = new Array(len1).fill(false);
//     const used2 = new Array(len2).fill(false);
  
//     for (let i = 0; i < len1; i++) {
//       const start = Math.max(0, i - matchDistance);
//       const end = Math.min(i + matchDistance + 1, len2);
//       for (let j = start; j < end; j++) {
//         if (!used2[j] && str1[i] === str2[j]) {
//           used1[i] = true;
//           used2[j] = true;
//           matches++;
//           break;
//         }
//       }
//     }
  
//     if (matches === 0) return 0;
//     const similarity = matches / len1 + matches / len2 + (matches / len1 + matches / len2) / 2;
//     return similarity / 3;
//   }