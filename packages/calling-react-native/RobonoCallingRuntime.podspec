require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'RobonoCallingRuntime'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://robono.com/docs#calling'
  s.license = { :type => 'SEE LICENSE IN LICENSE', :file => 'LICENSE' }
  s.author = 'Robono'
  s.source = { :git => 'https://github.com/IMLX16/robono-sdks.git', :tag => 'calling-v0.1.1' }
  s.platforms = { :ios => '15.1' }
  s.source_files = 'ios/*.{h,m}'
  s.frameworks = 'AVFAudio', 'UIKit'
  s.dependency 'React-Core'
end
