interface Greeting {
  name: string;
}

function hello({name}: Greeting): void {
  console.log(`Hello, ${name}!`);
}

hello({name: "c88"});
