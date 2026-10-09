//gets the number value of the day of the week; 0 through 6
let currentDay = new Date().getDay()

//find all elements with link tag, 'a'
let elements = document.querySelectorAll('a')

let dayColors = [
  '#a63d52',  //sunday
  '#784488',  //monday
  '#3d608a',  //tuesday
  '#2d7a82',  //wednesday
  '#3d7055',  //thursday
  '#9e7a2b',  //friday
  '#aa563f'   //saturday
];  //necessary semi ☹

//changes color for each link tag on page
[].slice.call(elements).forEach(function (e) {
  e.style.color = dayColors[currentDay]
})