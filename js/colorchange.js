//gets the number value of the day of the week; 0 through 6
let currentDay = new Date().getDay()

//find all elements with link tag, 'a'
let elements = document.querySelectorAll('a')

let dayColors = [
  '#cc334d',  //sunday
  '#ad33cc',  //monday
  '#337fcc',  //tuesday
  '#33ccc3',  //wednesday
  '#33cc57',  //thursday
  '#c7cc33',  //friday
  '#cc5733'   //saturday
];  //necessary semi ☹

//changes color for each link tag on page
[].slice.call(elements).forEach(function (e) {
  e.style.color = dayColors[currentDay]
})