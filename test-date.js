const now = new Date();
const str = now.toLocaleString("en-GB", { timeZone: "Asia/Baghdad", hourCycle: "h23" });
console.log(str);
const [datePart, timePart] = str.split(', ');
console.log(datePart, timePart);
if(timePart){
  console.log(timePart.split(':'));
}
