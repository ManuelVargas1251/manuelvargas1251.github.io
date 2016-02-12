var d = new Date();
var n = d.getDay();
  
if (n == 0) {
  //document.linkColor = "#cc334d";
  var elements = document.querySelectorAll('a');  //find all elements with 'a'
  [].slice.call(elements).forEach(function(elem){ //for loop of sorts
    elem.style.color = '#cc334d'; //changes color
  });
    }
if (n == 1) {
  //document.linkColor = "#ad33cc";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#ad33cc';
  });
  }

if (n == 2) {
  //document.linkColor = "#337fcc";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#337fcc';
  });
  }

if (n == 3) {
  //document.linkColor = "#33ccc3";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#33ccc3';
  });
  }
if (n == 4) {
  //document.linkColor = "#33cc57";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#33cc57';
  });
  }
if  (n == 5) {
  //document.linkColor = "#c7cc33";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#e6e600';
  });
  }
if (n == 6) {
  //document.linkColor = "#cc5733";
  var elements = document.querySelectorAll('a');
  [].slice.call(elements).forEach(function(elem){
    elem.style.color = '#cc5733';
  });
  }
